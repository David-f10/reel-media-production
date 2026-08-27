// netlify/functions/pad-sweep.js
// Scheduled Function QUOTIDIENNE (0 3 * * *, déclarée dans netlify.toml).
// Deux passes INDÉPENDANTES sur la base Production (DB_PROD), dans cet ordre :
//
//   PASSE 2 D'ABORD — ARCHIVAGE (le BUT, plafond 80/run) : les cartes Statut=PAD +
//     Archivé=false dont la Date de diffusion dépasse 30 jours sont archivées (Archivé=true).
//     Elle passe EN PREMIER pour prendre le budget de requêtes avant la datation : c'est ce
//     qui vide le tableau. N'écrit QUE Archivé — JAMAIS Date de diffusion.
//
//   PASSE 1 ENSUITE — RATTRAPAGE (le prérequis, plafond 80/run) : les cartes PAD anciennes
//     SANS date de diffusion (hors Brand, hors « En stock ») reçoivent Date de diffusion =
//     leur last_edited_time, pour entrer dans le circuit. Peut attendre le run suivant sans
//     conséquence.
//
// ⚠️ FLAGS DE RATE-LIMIT INDÉPENDANTS PAR PASSE (correctif) : chaque passe tourne
//   INCONDITIONNELLEMENT. Un 429 sur la datation n'empêche plus jamais l'archivage (c'était
//   le défaut : la passe 1 affamait la passe 2 via un flag partagé en journée).
//
// ⚠️ PIÈGE TEMPOREL NEUTRALISÉ PAR CONSTRUCTION :
//   - La PASSE 1 est le SEUL code qui écrit Date de diffusion, et ne sélectionne que les
//     cartes dont ce champ est VIDE (date is_empty). Datée une fois → quitte cet ensemble
//     définitivement → jamais relue ni réécrite. Écrire pousse last_edited_time à aujourd'hui,
//     mais plus rien ne le relira pour cette carte.
//   - last_edited_time est LU depuis le résultat de la requête, AVANT toute écriture.
//   - La PASSE 2 n'écrit JAMAIS Date de diffusion → ne peut pas corrompre la garde.
//   Crash / double-run : idempotents (cartes déjà datées / déjà archivées exclues par les filtres).
//
// VISIBILITÉ : l'URL de la fonction planifiée renvoie 403 (Netlify la réserve au cron), donc
//   le summary est écrit dans une ligne Notion dédiée (STATUT_ROW_ID) — TOUJOURS EN DERNIER,
//   best-effort : son échec ne perd que l'enregistrement de CE run, jamais l'archivage/datation
//   déjà effectués. Une seule tentative, pas de retry.
// FAIL-SAFE : arrêt propre sur 429 par passe. Logs = compteurs uniquement (jamais titre/code).
// Rollback : suppression de ce fichier + de son bloc netlify.toml = comportement précédent.

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const STATUT_ROW_ID = '3c975d81-5951-81ba-aefd-d56e5ddd94e8'; // ligne unique de « 🧹 Statut pad-sweep » (PATCH, jamais créée)
const CAP = 80;                 // cartes traitées par passe et par run
const WRITE_SPACING_MS = 350;   // ~< 3 req/s : marge sous le rate limit Notion

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function notion(token, method, path, body) {
  const res = await fetch(`${NOTION}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) {
    const err = new Error(`Notion ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return res.json();
}

// Pagine TOUTES les pages du filtre AVANT de rendre la liste (aucune écriture pendant la
// pagination : muter l'ensemble filtré ferait dériver le curseur).
async function queryAll(token, filter) {
  const out = [];
  let cursor = null;
  do {
    const body = { filter, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notion(token, 'POST', `/databases/${DB_PROD}/query`, body);
    out.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

exports.handler = async () => {
  const summary = {
    horodatage: null,
    archiveVus: 0, archives: 0, archiveRateLimited: false, archiveErreur: '',       // PASSE 2 (but)
    rattrapageVus: 0, rattrapageDates: 0, rattrapageRateLimited: false, rattrapageErreur: '', // PASSE 1
    erreursCartes: 0
  };
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('pad-sweep: NOTION_TOKEN manquant');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'NOTION_TOKEN manquant' }) };
  }

  // ── PASSE 2 D'ABORD — ARCHIVAGE (le but). Flag indépendant. ──
  try {
    const seuil = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const cartes = await queryAll(token, { and: [
      { property: 'Statut', select: { equals: 'PAD' } },
      { property: 'Archivé', checkbox: { equals: false } },
      { property: 'Date de diffusion', date: { on_or_before: seuil } } // on_or_before exclut nativement les dates vides
    ] });
    summary.archiveVus = cartes.length;
    for (const page of cartes.slice(0, CAP)) {
      try {
        await notion(token, 'PATCH', `/pages/${page.id}`, { properties: { 'Archivé': { checkbox: true } } });
        summary.archives++;
        await sleep(WRITE_SPACING_MS);
      } catch (e) {
        if (e.httpStatus === 429) { summary.archiveRateLimited = true; break; } // arrêt propre → reprise au prochain run
        summary.erreursCartes++;
      }
    }
  } catch (e) {
    summary.archiveErreur = (e.httpStatus ? e.httpStatus + ' ' : '') + e.message; // exception EXPOSÉE (plus avalée)
    console.warn('pad-sweep: passe archivage échouée —', summary.archiveErreur);
  }

  // ── PASSE 1 ENSUITE — RATTRAPAGE (prérequis). Flag INDÉPENDANT : tourne quoi qu'il arrive. ──
  try {
    const cartes = await queryAll(token, { and: [
      { property: 'Statut', select: { equals: 'PAD' } },
      { property: 'Archivé', checkbox: { equals: false } },
      { property: 'Date de diffusion', date: { is_empty: true } },
      { property: 'Format', select: { does_not_equal: 'Brand' } },
      { property: 'En stock', checkbox: { equals: false } } // ne JAMAIS rattraper une carte mise en stock volontairement
    ] });
    summary.rattrapageVus = cartes.length;
    for (const page of cartes.slice(0, CAP)) {
      const led = page.last_edited_time;          // LU depuis le résultat, AVANT toute écriture
      if (!led) { summary.erreursCartes++; continue; }
      const dateOnly = led.slice(0, 10);          // YYYY-MM-DD
      try {
        await notion(token, 'PATCH', `/pages/${page.id}`, { properties: { 'Date de diffusion': { date: { start: dateOnly } } } });
        summary.rattrapageDates++;
        await sleep(WRITE_SPACING_MS);
      } catch (e) {
        if (e.httpStatus === 429) { summary.rattrapageRateLimited = true; break; }
        summary.erreursCartes++;
      }
    }
  } catch (e) {
    summary.rattrapageErreur = (e.httpStatus ? e.httpStatus + ' ' : '') + e.message;
    console.warn('pad-sweep: passe rattrapage échouée —', summary.rattrapageErreur);
  }

  summary.horodatage = new Date().toISOString();

  // ── ÉCRITURE DU STATUT — TOUJOURS EN DERNIER, best-effort ──
  // Vient APRÈS tout le travail utile : son échec (429 ou autre) ne perd que l'enregistrement
  // de CE run, jamais l'archivage/datation déjà effectués. Une seule tentative, pas de retry.
  try {
    await sleep(500); // laisse la fenêtre de débit récupérer après la rafale d'écritures
    const resume =
      `${summary.archives} archivée${summary.archives > 1 ? 's' : ''} · ${summary.rattrapageDates} datée${summary.rattrapageDates > 1 ? 's' : ''}` +
      (summary.archiveErreur ? ' · ⛔ ERREUR ARCHIVAGE' : '') +
      (summary.rattrapageErreur ? ' · ⛔ ERREUR DATATION' : '') +
      ((summary.archiveRateLimited || summary.rattrapageRateLimited) ? ' · ⏳ rate-limited' : '');
    await notion(token, 'PATCH', `/pages/${STATUT_ROW_ID}`, { properties: {
      'Résumé': { title: [{ text: { content: resume } }] },
      'Dernier passage': { date: { start: summary.horodatage } },
      'Archivées': { number: summary.archives },
      'Vues archivage': { number: summary.archiveVus },
      'Datées': { number: summary.rattrapageDates },
      'Vues datation': { number: summary.rattrapageVus },
      'Erreur archivage': { rich_text: summary.archiveErreur ? [{ text: { content: String(summary.archiveErreur).slice(0, 1900) } }] : [] },
      'Erreur datation': { rich_text: summary.rattrapageErreur ? [{ text: { content: String(summary.rattrapageErreur).slice(0, 1900) } }] : [] },
      'Rate-limited archivage': { checkbox: summary.archiveRateLimited },
      'Rate-limited datation': { checkbox: summary.rattrapageRateLimited }
    } });
  } catch (e) {
    console.warn('pad-sweep: écriture statut échouée (best-effort, ignorée) —', e.httpStatus || '', e.message);
  }

  console.log('pad-sweep:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...summary }) };
};
