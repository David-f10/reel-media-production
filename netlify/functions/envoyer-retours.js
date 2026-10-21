// netlify/functions/envoyer-retours.js
// Lot A — ENVOI des brouillons client d'UNE version, en UNE série. Le numéro de série est DÉRIVÉ
// CÔTÉ SERVEUR (jamais reçu du navigateur) et posé une seule fois sur tous les retours de l'envoi :
// le lot C pourra s'appuyer dessus sans contournement possible depuis la console (c'est ici, et
// nulle part côté client, que « Série » est décidé). Appelle l'API Notion en direct avec
// NOTION_TOKEN (comme notify.js / drive-download-review.js), pas via le proxy notion.js.
//
//   POST { sujetId, version, ids:[...] } + en-tête x-review-token
//     1. jeton de review valide ET lié à CE sujet (verifyReview) — sinon 401/403 ;
//     2. CHAQUE id doit être un brouillon CLIENT EN LIGNE de CE sujet ET de CETTE version
//        (Source='Client' && 'Déposé en ligne' && Brouillon && Sujet ID==jeton && Version==version) ;
//        une seule anomalie → 403 et AUCUNE bascule (fail-closed) ;
//     3. série = max(Série du sujet) + 1, calculée UNE fois ; bascule Brouillon:false + Série sur tous.
//   Notion n'a pas de transaction : un échec partiel laisse des brouillons cohérents (re-renvoyables,
//   la série déjà posée est unique) et est signalé par { ok:false, sent, failed }.

const { verifyReview } = require('./_review');

const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';
const norm = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase();

async function notionGET(pageId, token) {
  const r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
  });
  if (!r.ok) throw new Error('GET ' + r.status);
  return r.json();
}
async function notionPATCH(pageId, token, body) {
  const r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('PATCH ' + r.status);
  return r.json();
}
async function notionQuery(dbId, token, body) {
  const r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error('query ' + r.status);
  return r.json();
}
function estDraftClientEnLigne(pr, sujetId, version) {
  if (!pr) return false;
  const src = pr.Source && pr.Source.select && pr.Source.select.name;
  const enLigne = !!(pr['Déposé en ligne'] && pr['Déposé en ligne'].checkbox);
  const brouillon = !!(pr.Brouillon && pr.Brouillon.checkbox);
  const sid = (pr['Sujet ID'] && pr['Sujet ID'].rich_text && pr['Sujet ID'].rich_text[0] && pr['Sujet ID'].rich_text[0].plain_text) || '';
  const ver = (pr.Version && pr.Version.select && pr.Version.select.name) || '';
  return src === 'Client' && enLigne && brouillon && norm(sid) === norm(sujetId) && ver === version;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-review-token',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const rtok = (event.headers && (event.headers['x-review-token'] || event.headers['X-Review-Token'])) || '';
  const rev = verifyReview(rtok); // fail-closed
  if (!rev.ok) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };

  const sujetId = String(body.sujetId || '').trim();
  const version = String(body.version || '').trim();
  const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string' && x) : [];
  if (!sujetId || norm(sujetId) !== norm(rev.sujetId)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Hors périmètre du lien' }) };
  }
  if (!version || !ids.length) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (version, ids)' }) };
  if (ids.length > 100) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Trop de retours' }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Token Notion manquant' }) };

  // 1) Vérifier CHAQUE id. Fail-closed : une seule anomalie → 403, rien n'est basculé.
  try {
    for (const id of ids) {
      const page = await notionGET(id, token);
      if (!estDraftClientEnLigne(page && page.properties, sujetId, version)) {
        return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Un retour n\'est pas un brouillon en ligne de ce sujet/version' }) };
      }
    }
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Vérification impossible' }) };
  }

  // 2) Série dérivée CÔTÉ SERVEUR : le retour du sujet au plus grand n° de série, +1. Calculée UNE fois.
  let serie;
  try {
    const d = await notionQuery(DB_RETOURS, token, {
      filter: { property: 'Sujet ID', rich_text: { equals: sujetId } },
      sorts: [{ property: 'Série', direction: 'descending' }],
      page_size: 1
    });
    const top = (d.results || [])[0];
    const maxSerie = (top && top.properties['Série'] && top.properties['Série'].number) || 0;
    serie = maxSerie + 1;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Série indisponible' }) };
  }

  // 3) Bascule : Brouillon:false + MÊME Série sur tous. N PATCH (pas de transaction Notion).
  const sent = [], failed = [];
  for (const id of ids) {
    try { await notionPATCH(id, token, { properties: { 'Brouillon': { checkbox: false }, 'Série': { number: serie } } }); sent.push(id); }
    catch (e) { failed.push(id); }
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: failed.length === 0, serie, sent: sent.length, failed: failed.length }) };
};
