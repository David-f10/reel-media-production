// netlify/functions/rattrapage-espace.js
// Lot G tranche 2 — RATTRAPAGE de l'espace client : exposer, pour chaque projet Brand portant une V(x), sa
// DERNIÈRE version (visionnable + téléchargeable). Les livrés (PAD ou diffusion passée) → « validé », le
// reste → « V1 à relire ». But : combler le fait qu'aucun geste rétroactif n'a posé Visible / Date envoi.
//
// ⚠️ MODE DRY-RUN SEULEMENT pour l'instant : cette fonction N'ÉCRIT RIEN. Elle rend la LISTE de ce qu'un
// apply écrirait — version retenue par projet, livré ou non, date choisie, et TOUTES les ambiguïtés — pour
// que David la valide AVANT. L'apply (idempotent) sera livré dans une PR suivante, après validation de la liste.
//
// MÉTHODE (tranchée par David) :
//  • dernière version = plus grand numéro parsé depuis « Version » (TEXTE), parmi celles AVEC un lien ET
//    NON « Annulée » — c'est la clé sémantique (createdTime n'ordonne PAS : le lot d'import 2026-05-11 a un
//    createdTime uniforme ; hors de ce lot, createdTime est de la vraie chronologie).
//  • départage de deux libellés identiques : createdTime (fiable HORS lot 2026-05-11) ; DANS le lot → on
//    LISTE l'ambiguïté, on ne devine pas.
//  • date « Date envoi client » = createdTime de la version retenue, SAUF s'il vaut 2026-05-11 → date de
//    diffusion si elle existe, sinon LISTÉ ambigu (date à fournir).
//  • livré = Statut 'PAD' OU Date de diffusion passée → pose aussi « Date validation client » ; sinon « à relire ».
//  • idempotent : un projet déjà exposé + daté sur la bonne version → « déjà en place » (0 écriture).

const { verifyUser } = require('./_auth');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const LOT_IMPORT = '2026-05-11'; // createdTime uniforme de l'import en masse → inexploitable pour ordonner/dater
const norm = (s) => String(s || '').replace(/-/g, '').toLowerCase();

const rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const cb = (pr, k) => !!(pr && pr[k] && pr[k].checkbox);
const dstart = (pr, k) => (pr && pr[k] && pr[k].date && pr[k].date.start) || '';
const dateOnly = (iso) => String(iso || '').slice(0, 10);
const numVersion = (v) => { const m = /V\s*(\d+)/i.exec(String(v || '')); return m ? parseInt(m[1], 10) : null; };
function extractFileId(raw) { const s = String(raw || ''); const m = s.match(/\/file\/d\/([\w-]+)/); return m ? m[1] : (/[?&]id=([\w-]{10,})/.test(s) ? s.match(/[?&]id=([\w-]{10,})/)[1] : ''); }

async function queryTout(dbId, filtre, token) {
  const out = [];
  let cursor = null, pages = 0;
  do {
    const b = { page_size: 100 }; if (filtre) b.filter = filtre; if (cursor) b.start_cursor = cursor;
    const r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(b)
    });
    if (!r.ok) throw new Error('query ' + String(dbId).slice(0, 4) + ' ' + r.status);
    const d = await r.json();
    out.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null; pages++;
  } while (cursor && pages < 40);
  return out;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('rattrapage indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // Auth membre non-Externe (lecture seule ici ; l'APPLY, à venir, exigera sa propre garde délibérée).
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  if (auth.user.acces === 'Externe') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé à l\'équipe' }) };

  // SÉCURITÉ : tant que l'apply n'existe pas, on refuse FRANCHEMENT tout autre mode (jamais d'écriture ici).
  if (body.mode !== 'dry-run') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'mode « dry-run » requis — l\'apply n\'est pas encore livré, cette fonction n\'écrit rien' }) };
  }

  try {
    const auj = new Date().toISOString().slice(0, 10);
    // Tous les projets Brand (non supprimés). NB : les pages Notion mises en CORBEILLE ne reviennent pas ici
    // — si « archivés » veut dire corbeille Notion, il faudra une passe archived (signalé dans la PR).
    const projets = await queryTout(DB_PROD, { property: 'Format', select: { equals: 'Brand' } }, token);
    // Toutes les versions, groupées par Sujet ID normalisé (une lecture, pagination bornée).
    const versions = await queryTout(DB_VERSIONS, null, token);
    const parSujet = {};
    versions.forEach(v => { const sid = norm(rt(v.properties, 'Sujet ID')); (parSujet[sid] = parSujet[sid] || []).push(v); });

    const aEcrire = [], aRevoir = [], dejaEnPlace = [];
    let ecritures = 0;

    projets.forEach(p => {
      const pr = p.properties;
      const code = rt(pr, 'Code'), titre = ti(pr, 'Titre');
      const base = { code, titre, sujetId: p.id };
      const vs = parSujet[norm(p.id)] || [];
      // Candidates : lien vidéo EXPLOITABLE (fileId NON VIDE — un lien de dossier, ou un champ présent mais
      // sans id de fichier, ne compte pas : sinon le projet s'exposerait et se marquerait validé sans rien à
      // regarder), NON Annulée, numéro de version parsable. On teste extractFileId, pas la seule présence d'un motif.
      const cand = vs.filter(v => extractFileId(ti(v.properties, 'Titre')) !== '' && sel(v.properties, 'Statut') !== 'Annulée' && numVersion(rt(v.properties, 'Version')) !== null);
      if (!cand.length) { aRevoir.push({ ...base, raison: 'aucune version avec un lien vidéo exploitable (ou toutes Annulées / sans numéro)' }); return; }

      const maxN = Math.max(...cand.map(v => numVersion(rt(v.properties, 'Version'))));
      let tied = cand.filter(v => numVersion(rt(v.properties, 'Version')) === maxN);
      let chosen;
      if (tied.length === 1) { chosen = tied[0]; }
      else {
        // Doublon de libellé au numéro max : départage par createdTime SAUF si tous dans le lot d'import.
        const tousImport = tied.every(v => dateOnly(v.created_time) === LOT_IMPORT);
        if (tousImport) { aRevoir.push({ ...base, raison: 'doublon de libellé « V' + maxN + ' » dans le lot d\'import (createdTime uniforme) — à départager à la main' }); return; }
        chosen = tied.slice().sort((a, b) => a.created_time < b.created_time ? 1 : -1)[0]; // plus récent
      }

      const vPr = chosen.properties;
      const envoiExistant = dstart(vPr, 'Date envoi client'); // date RÉELLE déjà posée (prime, jamais réécrite)
      const creeLe = dateOnly(chosen.created_time);
      const diffusion = dstart(pr, 'Date de diffusion');
      const livre = sel(pr, 'Statut') === 'PAD' || (diffusion && diffusion < auj);
      // Date de référence = ce qui EST / SERAIT en base, jamais une autre. Si « Date envoi client » est déjà
      // posée, c'est ELLE (l'apply, idempotent, ne la réécrit pas). Sinon la date calculée (createdTime, sauf
      // lot d'import → date de diffusion), qui est exactement ce que l'apply écrirait. Le dry-run affiche donc
      // toujours la date qui finira en base — y compris pour l'ancrage de « Date validation client » d'un livré.
      let dateEnvoi;
      if (envoiExistant) dateEnvoi = dateOnly(envoiExistant);
      else if (creeLe && creeLe !== LOT_IMPORT) dateEnvoi = creeLe;
      else if (diffusion) dateEnvoi = dateOnly(diffusion);
      else { aRevoir.push({ ...base, raison: 'version du lot d\'import sans date de diffusion → date d\'envoi à fournir', versionLabel: rt(chosen.properties, 'Version') }); return; }

      // Idempotence : qu'est-ce qui MANQUE réellement ? (la fonction apply n'écrira que ça)
      const dejaEnvoi = !!envoiExistant;
      const dejaValide = !!dstart(vPr, 'Date validation client');
      const dejaVisible = cb(pr, 'Visible espace client');
      const aPoser = [];
      if (!dejaVisible) aPoser.push('Visible espace client');
      if (!dejaEnvoi) aPoser.push('Date envoi client=' + dateEnvoi);
      if (livre && !dejaValide) aPoser.push('Date validation client=' + dateEnvoi);

      const entree = { ...base, versionLabel: rt(vPr, 'Version'), fileId: extractFileId(ti(vPr, 'Titre')), livre: !!livre, etat: livre ? 'validé' : 'à relire', dateEnvoi, aPoser };
      if (!aPoser.length) { dejaEnPlace.push(entree); return; }
      ecritures += aPoser.length;
      aEcrire.push(entree);
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true, dryRun: true, aucuneEcriture: true,
        resume: {
          projetsBrand: projets.length,
          aEcrire: aEcrire.length, dontLivres: aEcrire.filter(e => e.livre).length, dontARelire: aEcrire.filter(e => !e.livre).length,
          dejaEnPlace: dejaEnPlace.length, aRevoir: aRevoir.length,
          ecrituresEstimees: ecritures
        },
        aEcrire, aRevoir, dejaEnPlace
      })
    };
  } catch (e) {
    console.error('rattrapage indispo : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
