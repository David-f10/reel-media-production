// netlify/functions/rattrapage-espace.js
// Lot G tranche 2 — RATTRAPAGE de l'espace client : exposer, pour chaque projet Brand portant une V(x), sa
// DERNIÈRE version (visionnable + téléchargeable). Les livrés (PAD ou diffusion passée) → « validé », le
// reste → « à relire ». But : combler le fait qu'aucun geste rétroactif n'a posé Visible / Date envoi.
//
// DEUX MODES, TOUJOURS EXPLICITES ({ mode:'dry-run' } | { mode:'apply' }) — jamais de défaut : une faute de
// frappe ne doit pas déclencher d'écriture.
//   dry-run → N'ÉCRIT RIEN. Rend la liste de ce qu'un apply écrirait (version retenue, livré ou non, date,
//             ambiguïtés). Garde : membre non-Externe (lecture seule).
//   apply   → ÉCRIT. Garde : PORTEUR DE LA CLÉ (peutGererAcces), comme access-set / code-reset — c'est une
//             opération en masse sur des projets réels.
//
// L'APPLY RECALCULE, il NE REJOUE PAS une liste. Il refait EXACTEMENT le même calcul que le dry-run (fonction
// analyser, partagée), au moment où il tourne, sur une relecture fraîche de Notion. Il ne prend AUCUNE liste
// en paramètre : sinon on appliquerait une photo périmée, la base ayant pu bouger entre la validation et le clic.
//
// IDEMPOTENT champ par champ : l'apply ne pose QUE ce qui manque (une Date envoi client déjà posée n'est
// jamais réécrite — le numéro client est figé ; une case déjà cochée n'est pas retouchée). Relancer deux fois
// est sans effet la seconde fois (le projet bascule en « déjà en place »).
//
// RAPPORT, pas un « ok » global : 111 écritures SANS transaction → un échec PARTIEL est le cas normal. L'apply
// n'avorte pas au premier échec : il continue, et rend projet par projet ce qui a RÉELLEMENT été écrit + la
// liste des échecs, pour qu'on sache exactement quoi relancer (la relance étant idempotente).
//
// MÉTHODE (tranchée par David) :
//  • dernière version = plus grand numéro parsé depuis « Version » (TEXTE), parmi celles à lien EXPLOITABLE
//    (fileId non vide) ET NON « Annulée ». createdTime n'ordonne pas (lot d'import 2026-05-11 uniforme).
//  • départage de deux libellés identiques : createdTime (fiable HORS lot 2026-05-11) ; DANS le lot → ambigu.
//  • date « Date envoi client » : celle DÉJÀ posée si elle existe (prime), sinon createdTime, sauf lot d'import
//    → date de diffusion, sinon ambigu (date à fournir).
//  • livré = Statut 'PAD' OU Date de diffusion passée → pose aussi « Date validation client » ; sinon « à relire ».

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

// Vue PUBLIQUE d'une entrée (sans la plomberie ops/versionId) — identique au dry-run validé par David.
function vue(e) { return { code: e.code, titre: e.titre, sujetId: e.sujetId, versionLabel: e.versionLabel, fileId: e.fileId, livre: e.livre, etat: e.etat, dateEnvoi: e.dateEnvoi, aPoser: e.aPoser }; }

// ANALYSE — le cœur partagé par dry-run ET apply. Entrée : projets Brand + versions (lues fraîches). Sortie :
// { aEcrire, aRevoir, dejaEnPlace }. Chaque entrée aEcrire porte, en plus des champs publics, des « ops »
// structurées (page cible + propriété Notion) que l'apply exécute — jamais de liste venue du client.
function analyser(projets, versions, auj) {
  const parSujet = {};
  versions.forEach(v => { const sid = norm(rt(v.properties, 'Sujet ID')); (parSujet[sid] = parSujet[sid] || []).push(v); });

  const aEcrire = [], aRevoir = [], dejaEnPlace = [];
  projets.forEach(p => {
    const pr = p.properties;
    const code = rt(pr, 'Code'), titre = ti(pr, 'Titre');
    const base = { code, titre, sujetId: p.id };
    const vs = parSujet[norm(p.id)] || [];
    // Candidates : lien vidéo EXPLOITABLE (fileId NON VIDE), NON Annulée, numéro de version parsable.
    const cand = vs.filter(v => extractFileId(ti(v.properties, 'Titre')) !== '' && sel(v.properties, 'Statut') !== 'Annulée' && numVersion(rt(v.properties, 'Version')) !== null);
    if (!cand.length) { aRevoir.push({ ...base, raison: 'aucune version avec un lien vidéo exploitable (ou toutes Annulées / sans numéro)' }); return; }

    const maxN = Math.max(...cand.map(v => numVersion(rt(v.properties, 'Version'))));
    const tied = cand.filter(v => numVersion(rt(v.properties, 'Version')) === maxN);
    let chosen;
    if (tied.length === 1) { chosen = tied[0]; }
    else {
      const tousImport = tied.every(v => dateOnly(v.created_time) === LOT_IMPORT);
      if (tousImport) { aRevoir.push({ ...base, raison: 'doublon de libellé « V' + maxN + ' » dans le lot d\'import (createdTime uniforme) — à départager à la main' }); return; }
      chosen = tied.slice().sort((a, b) => a.created_time < b.created_time ? 1 : -1)[0]; // plus récent
    }

    const vPr = chosen.properties;
    const envoiExistant = dstart(vPr, 'Date envoi client'); // date RÉELLE déjà posée (prime, jamais réécrite)
    const creeLe = dateOnly(chosen.created_time);
    const diffusion = dstart(pr, 'Date de diffusion');
    const livre = sel(pr, 'Statut') === 'PAD' || (diffusion && diffusion < auj);
    let dateEnvoi;
    if (envoiExistant) dateEnvoi = dateOnly(envoiExistant);
    else if (creeLe && creeLe !== LOT_IMPORT) dateEnvoi = creeLe;
    else if (diffusion) dateEnvoi = dateOnly(diffusion);
    else { aRevoir.push({ ...base, raison: 'version du lot d\'import sans date de diffusion → date d\'envoi à fournir', versionLabel: rt(vPr, 'Version') }); return; }

    // Ops = SOURCE DE VÉRITÉ (ce que l'apply écrira) ; l'affichage aPoser en est dérivé → jamais de divergence.
    // Visible va sur la page SUJET ; les dates sur la page VERSION. On ne pose QUE ce qui manque (idempotence).
    const ops = [];
    if (!cb(pr, 'Visible espace client')) ops.push({ pageId: p.id, prop: { 'Visible espace client': { checkbox: true } }, affiche: 'Visible espace client' });
    if (!envoiExistant) ops.push({ pageId: chosen.id, prop: { 'Date envoi client': { date: { start: dateEnvoi } } }, affiche: 'Date envoi client=' + dateEnvoi });
    if (livre && !dstart(vPr, 'Date validation client')) ops.push({ pageId: chosen.id, prop: { 'Date validation client': { date: { start: dateEnvoi } } }, affiche: 'Date validation client=' + dateEnvoi });

    const entree = { ...base, versionId: chosen.id, versionLabel: rt(vPr, 'Version'), fileId: extractFileId(ti(vPr, 'Titre')), livre: !!livre, etat: livre ? 'validé' : 'à relire', dateEnvoi, aPoser: ops.map(o => o.affiche), ops };
    if (!ops.length) { dejaEnPlace.push(entree); return; }
    aEcrire.push(entree);
  });

  return { aEcrire, aRevoir, dejaEnPlace };
}

// EXÉCUTION (apply seulement). Une PATCH par page (sujet / version), ops groupées. Continue sur échec ; rend
// ce qui a été RÉELLEMENT écrit + les échecs, projet par projet.
async function appliquer(aEcrire, token) {
  const ecrits = [], echecs = [];
  for (const e of aEcrire) {
    const parPage = {};
    e.ops.forEach(o => { const g = (parPage[o.pageId] = parPage[o.pageId] || { props: {}, champs: [] }); Object.assign(g.props, o.prop); g.champs.push(o.affiche); });
    const faits = [], rates = [];
    for (const pageId of Object.keys(parPage)) {
      const g = parPage[pageId];
      try {
        const r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: g.props })
        });
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error('PATCH ' + r.status + (b && b.code ? ' ' + b.code : '')); }
        faits.push(...g.champs);
      } catch (err) {
        rates.push({ pageId, champs: g.champs, erreur: (err && err.message) || 'inconnue' });
      }
    }
    if (faits.length) ecrits.push({ code: e.code, titre: e.titre, champs: faits });
    if (rates.length) { console.error('rattrapage apply : échec sur ' + e.code + ' — ' + rates.map(x => x.champs.join('+') + ' (' + x.erreur + ')').join(', ')); echecs.push({ code: e.code, titre: e.titre, rates }); }
  }
  return { ecrits, echecs };
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('rattrapage indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // Mode TOUJOURS explicite — jamais de défaut (une faute de frappe ne doit pas écrire).
  const mode = body.mode;
  if (mode !== 'dry-run' && mode !== 'apply') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'mode requis : « dry-run » (lecture) ou « apply » (écriture)' }) };
  }

  // Auth membre non-Externe (socle commun).
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  if (auth.user.acces === 'Externe') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé à l\'équipe' }) };

  // GARDE D'ÉCRITURE : l'apply est réservé au PORTEUR DE LA CLÉ (peutGererAcces), comme access-set/code-reset.
  if (mode === 'apply' && auth.user.peutGererAcces !== true) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires d\'accès (porteur de la clé)' }) };
  }

  try {
    const auj = new Date().toISOString().slice(0, 10);
    // Relecture FRAÎCHE à chaque appel (l'apply recalcule, il ne rejoue pas). Pages en corbeille Notion
    // exclues (signalé : si « archivé » = corbeille, une passe archived serait à ajouter).
    const projets = await queryTout(DB_PROD, { property: 'Format', select: { equals: 'Brand' } }, token);
    const versions = await queryTout(DB_VERSIONS, null, token);
    const { aEcrire, aRevoir, dejaEnPlace } = analyser(projets, versions, auj);

    if (mode === 'dry-run') {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true, dryRun: true, aucuneEcriture: true,
          resume: {
            projetsBrand: projets.length,
            aEcrire: aEcrire.length, dontLivres: aEcrire.filter(e => e.livre).length, dontARelire: aEcrire.filter(e => !e.livre).length,
            dejaEnPlace: dejaEnPlace.length, aRevoir: aRevoir.length,
            ecrituresEstimees: aEcrire.reduce((n, e) => n + e.ops.length, 0)
          },
          aEcrire: aEcrire.map(vue), aRevoir, dejaEnPlace: dejaEnPlace.map(vue)
        })
      };
    }

    // mode === 'apply'
    const { ecrits, echecs } = await appliquer(aEcrire, token);
    const champsEcrits = ecrits.reduce((n, e) => n + e.champs.length, 0);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true, mode: 'apply', complet: echecs.length === 0,
        resume: {
          projetsBrand: projets.length,
          aTraiter: aEcrire.length, projetsEcrits: ecrits.length, champsEcrits,
          projetsEnEchec: echecs.length,
          dejaEnPlace: dejaEnPlace.length, aRevoir: aRevoir.length
        },
        ecrits,                 // projet par projet : ce qui a RÉELLEMENT été écrit
        echecs,                 // liste des échecs (relance idempotente pour les reprendre)
        aRevoir,                // écartés (ambigus) — non touchés, pour mémoire
        dejaEnPlace: dejaEnPlace.map(vue)
      })
    };
  } catch (e) {
    console.error('rattrapage indispo : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};

// Exposé pour le banc isolé.
module.exports._test = { analyser };
