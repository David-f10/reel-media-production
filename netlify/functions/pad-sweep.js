// netlify/functions/pad-sweep.js
// Scheduled Function QUOTIDIENNE (0 3 * * *, déclarée dans netlify.toml).
// Deux passes distinctes sur la base Production (DB_PROD) :
//
//   PASSE 1 — RATTRAPAGE (plafond 80/nuit) : les cartes PAD anciennes SANS date de
//     diffusion (jamais passées par le popup) reçoivent Date de diffusion = leur
//     last_edited_time, pour entrer dans le circuit normal. Exclut le Brand (attente
//     client légitime → last_edited_time y serait un faux proxy).
//
//   PASSE 2 — PERMANENTE (plafond 80/nuit) : les cartes PAD dont la Date de diffusion
//     dépasse 30 jours sont archivées (Archivé=true). Filtre Statut=PAD : on n'archive
//     jamais une carte en fabrication qui porterait une date de diffusion prévisionnelle
//     saisie à la main. Cette passe n'écrit QUE Archivé — JAMAIS Date de diffusion.
//
// ⚠️ PIÈGE TEMPOREL NEUTRALISÉ PAR CONSTRUCTION :
//   - La PASSE 1 est le SEUL code qui écrit Date de diffusion, et elle ne sélectionne que
//     les cartes dont ce champ est VIDE (date is_empty). Dès qu'une carte est datée, elle
//     quitte définitivement cet ensemble → jamais relue, jamais réécrite. Écrire pousse
//     last_edited_time à aujourd'hui, mais plus rien ne le relira pour cette carte.
//   - last_edited_time est LU depuis le résultat de la requête, AVANT toute écriture → la
//     vraie valeur est figée avant que Notion ne la remplace par aujourd'hui.
//   - La PASSE 2 n'écrit JAMAIS Date de diffusion → elle ne peut pas corrompre la garde.
//   Crash au milieu / double-run : idempotents (cartes déjà datées / déjà archivées exclues
//   par les filtres ; les autres reviennent la nuit suivante).
//
// FAIL-SAFE : arrêt propre sur 429 (rate limit Notion) — les cartes restantes sont reprises
//   au prochain passage. Logs = compteurs uniquement (jamais titre ni code de carte).
// Rollback : suppression de ce fichier + de son bloc netlify.toml = comportement précédent.

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const CAP = 80;                 // cartes traitées par passe et par nuit
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
  const summary = { rattrapageVus: 0, rattrapageDates: 0, archiveVus: 0, archives: 0, erreurs: 0, rateLimited: false };
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('pad-sweep: NOTION_TOKEN manquant');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'NOTION_TOKEN manquant' }) };
  }

  // ── PASSE 1 — RATTRAPAGE (plafond CAP) : écrit Date de diffusion = last_edited_time ──
  try {
    const cartes = await queryAll(token, { and: [
      { property: 'Statut', select: { equals: 'PAD' } },
      { property: 'Archivé', checkbox: { equals: false } },
      { property: 'Date de diffusion', date: { is_empty: true } },
      { property: 'Format', select: { does_not_equal: 'Brand' } }
    ] });
    summary.rattrapageVus = cartes.length;
    for (const page of cartes.slice(0, CAP)) {
      const led = page.last_edited_time;          // LU depuis le résultat, AVANT toute écriture
      if (!led) { summary.erreurs++; continue; }
      const dateOnly = led.slice(0, 10);          // YYYY-MM-DD
      try {
        await notion(token, 'PATCH', `/pages/${page.id}`, {
          properties: { 'Date de diffusion': { date: { start: dateOnly } } }
        });
        summary.rattrapageDates++;
        await sleep(WRITE_SPACING_MS);
      } catch (e) {
        if (e.httpStatus === 429) { summary.rateLimited = true; break; } // arrêt propre → reprise nuit suivante
        summary.erreurs++;
      }
    }
  } catch (e) {
    summary.erreurs++;
    console.warn('pad-sweep: passe rattrapage échouée —', e.httpStatus || '', e.message);
  }

  // ── PASSE 2 — PERMANENTE (plafond CAP) : archive les PAD diffusées > 30 j.
  //    N'écrit QUE Archivé — JAMAIS Date de diffusion. ──
  if (!summary.rateLimited) {
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
          await notion(token, 'PATCH', `/pages/${page.id}`, {
            properties: { 'Archivé': { checkbox: true } }
          });
          summary.archives++;
          await sleep(WRITE_SPACING_MS);
        } catch (e) {
          if (e.httpStatus === 429) { summary.rateLimited = true; break; }
          summary.erreurs++;
        }
      }
    } catch (e) {
      summary.erreurs++;
      console.warn('pad-sweep: passe permanente échouée —', e.httpStatus || '', e.message);
    }
  }

  console.log('pad-sweep:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...summary }) };
};
