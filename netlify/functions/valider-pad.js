// netlify/functions/valider-pad.js
// Lot G tranche 2 — VALIDATION CLIENT AUTOMATIQUE au passage en PAD.
//
// RÈGLE MÉTIER : un film ne part pas en PAD si le client n'est pas d'accord. Le passage au statut PAD EST
// donc le signal de validation client — pas un geste séparé « le client a validé » (celui-là, le client le
// fait depuis son espace). Quand un projet passe PAD, le serveur pose « Date validation client » sur la
// COURANTE (la dernière version envoyée au client), SI elle n'y est pas déjà.
//
// POINT D'ANCRAGE : index.html appelle cette fonction depuis _padAppliquer, juste après le PATCH PAD réussi.
// _padAppliquer est l'UNIQUE écrivain de Statut=PAD de toute l'app (vérifié : « name:'PAD' » n'apparaît
// qu'une fois ; les trois écrivains génériques de Statut — retour Corrigé/Ouvert, plafond « Validation
// chef », et updStatut qui intercepte PAD et part sur la popup — ne peuvent pas produire PAD). Les quatre
// chemins UI qui mènent à PAD convergent tous ici, donc un seul hook les couvre.
//
// IDEMPOTENT, la date du CLIENT gagne toujours : si « Date validation client » est déjà posée (le client a
// validé lui-même depuis l'espace avant le PAD), on ne touche à RIEN et on renvoie sa date. Re-PAD → re-no-op.
//
// SANS COURANTE = NON-ÉVÉNEMENT EXPLICITE : un projet qui passe PAD sans aucune version envoyée au client
// n'a rien sur quoi poser la validation. On renvoie { ok:true, sansVersion:true } — PAS une erreur. Le PAD a
// eu lieu normalement ; il n'y a simplement rien à valider. Le hook ignore ce retour en silence.
//
// ── POURQUOI AUCUNE GARDE DE RÔLE (à lire avant d'en ajouter une) ──
// Le PAD n'a AUCUNE garde de rôle dans l'app : tous les rôles y passent, un journaliste peut passer une
// carte en PAD (cf. commentaire index.html l.5849). Avec la nouvelle règle, ce geste marque donc le film
// comme VALIDÉ PAR LE CLIENT, et c'est TERMINAL — une fois la courante validée, le client perd le droit
// d'envoyer des retours (valider-client renvoie 409 sur une version validée).
//   LE CAS QUI FAIT MAL : une version est chez le client, il n'a pas encore répondu, quelqu'un passe la
//   carte en PAD un peu vite → le client lit « vous avez validé cette version » et ne peut plus parler.
//   DÉCISION (David) : on ACCEPTE, on ne met PAS de garde de rôle sur le PAD — c'est un état d'avancement
//   que toute l'équipe gère, le verrouiller casserait leur flux. Le cas est borné : le hook ne pose quelque
//   chose QUE s'il existe une courante.
//   SI ÇA MORD un jour : la réponse sera une CONFIRMATION dans la popup de diffusion (« ce film sera marqué
//   comme validé par le client »), PAS une garde de rôle. Ne transforme pas ce commentaire en garde sans
//   relire ce raisonnement en entier.
// On bloque quand même l'Externe : c'est une frontière de cloisonnement universelle de l'app (un accès, pas
// un rôle), pas la garde de rôle que la décision écarte.
//
// Écriture CÔTÉ SERVEUR (NOTION_TOKEN) : le proxy (notion.js) est interdit de PATCH sur ces champs et ne
// peut pas porter la garde d'idempotence — on passe par une fonction dédiée, comme envoyer-version.

const { verifyUser } = require('./_auth');

const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const norm = (s) => String(s || '').replace(/-/g, '').toLowerCase();
const dstart = (pr, k) => (pr && pr[k] && pr[k].date && pr[k].date.start) || '';
const rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');

function notionFetch(pathApi, method, token, bodyObj) {
  return fetch('https://api.notion.com/v1' + pathApi, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('valider-pad indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // ── Membre authentifié NON-Externe (pas de garde de rôle : cf. en-tête) ──
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  if (auth.user.acces === 'Externe') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé à l\'équipe' }) };

  const sujetId = String(body.sujetId || '').trim();
  if (!/^[0-9a-f]{32}$/.test(norm(sujetId))) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'sujetId manquant ou invalide' }) };

  // ── Résoudre la COURANTE : la dernière version ENVOYÉE au client (Date envoi client posée), triée par
  //    cette date (départage par id de page, comme espace-client). C'est exactement la version que le client
  //    voit comme courante. On NE pose JAMAIS de validation ailleurs que sur cette version-là. ──
  let versions;
  try {
    const r = await notionFetch('/databases/' + DB_VERSIONS + '/query', 'POST', token, {
      filter: { property: 'Sujet ID', rich_text: { equals: sujetId } }, page_size: 100
    });
    if (!r.ok) throw new Error('query versions ' + r.status);
    versions = (await r.json()).results || [];
  } catch (e) { console.error('valider-pad indispo (lecture versions) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  const envoyees = versions
    .filter(v => dstart(v.properties, 'Date envoi client'))
    .sort((a, b) => {
      const da = dstart(a.properties, 'Date envoi client'), db = dstart(b.properties, 'Date envoi client');
      return da < db ? -1 : da > db ? 1 : (a.id < b.id ? -1 : 1);
    });
  const courante = envoyees.length ? envoyees[envoyees.length - 1] : null;

  // Sans courante → NON-ÉVÉNEMENT (pas une erreur). Le PAD a eu lieu, rien à valider.
  if (!courante) {
    console.log('valider-pad : sujet ' + sujetId + ' passé PAD SANS version envoyée au client → non-événement (aucune validation posée)');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sansVersion: true }) };
  }

  // Idempotence : la date du CLIENT gagne. Déjà validée (par le client depuis l'espace, ou par un PAD
  // précédent) → on ne réécrit rien.
  const dejaValide = dstart(courante.properties, 'Date validation client');
  if (dejaValide) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dejaValide: true, date: dejaValide }) };
  }

  // Poser « Date validation client » = AUJOURD'HUI (le PAD a lieu maintenant ; la date de diffusion peut être
  // future, elle ne reflète pas l'instant de validation). Serveur-side, non falsifiable par la page.
  const aujourdHui = new Date().toISOString().slice(0, 10);
  try {
    const r = await notionFetch('/pages/' + courante.id, 'PATCH', token, { properties: { 'Date validation client': { date: { start: aujourdHui } } } });
    if (!r.ok) throw new Error('PATCH validation ' + r.status);
  } catch (e) { console.error('valider-pad indispo (pose validation) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  // Trace EXPLICITE : chaque pose automatique est lisible dans les logs — quel sujet, quelle version,
  // déclenchée par le PAD (et non par le client). Si le cas qui fait mal se produit, on le lit sans deviner.
  const versionLabel = rt(courante.properties, 'Version') || ti(courante.properties, 'Titre') || '(sans libellé)';
  console.log('valider-pad : validation client POSÉE par PAD (non par le client) — sujet ' + sujetId + ', version « ' + versionLabel + ' » (page ' + courante.id + '), date ' + aujourdHui);

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, pose: true, date: aujourdHui, versionPageId: courante.id, version: versionLabel }) };
};
