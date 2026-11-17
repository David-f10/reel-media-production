// netlify/functions/code-client.js
// Changer SON PROPRE code d'accès client. Route dédiée (écriture directe NOTION_TOKEN, jamais le proxy), parce
// que l'id du titulaire vient du JETON — ⛔ JAMAIS du corps : il n'y a AUCUN paramètre de cible, on ne peut
// changer que son propre code. L'ANCIEN code est exigé et vérifié (un jeton dure 14 j ; sans lui, un jeton volé
// verrouillerait le vrai titulaire hors de son espace). Throttlée (POLICE_CLIENT) contre le brute-force de
// l'ancien code. ⛔ AUCUNE valeur de code n'est lue hors comparaison, ni journalisée, ni renvoyée, jamais.
// ⚠ Changer son code NE RÉVOQUE PAS les sessions existantes (jetons id-based, sans révocation) — limite assumée.

const { verifier } = require('./_clienttoken');
const { contactActif, SEUIL_CODE_COURT } = require('./_authclient');
const { verifierThrottle, enregistrerEchec, enregistrerSucces } = require('./_throttle');

const MIN_CODE = SEUIL_CODE_COURT; // même seuil que « code court » (source unique dans _authclient)
const normId = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase();
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}
function clientIp(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || '').trim() || String(h['x-forwarded-for'] || '').split(',')[0].trim() || '';
}
async function nf(pathApi, method, token, bodyObj) {
  const opt = { method, headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28' } };
  if (bodyObj !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(bodyObj); }
  return fetch('https://api.notion.com/v1' + pathApi, opt);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const token = process.env.NOTION_TOKEN, dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('code-client indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // ── Identité : UNIQUEMENT le jeton. ⛔ Aucun targetId : on ne peut changer que son propre code. ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) }; // emprunt chef : jamais le code d'un client

  // Throttle (POLICE_CLIENT) : brute-force de l'ancien code via un jeton volé. a1=IP, a2=id du contact.
  // ⚠ L'axe secondaire a la clé 'm' (prévue pour un mail) : ici elle porte l'ID. Un uuid et un mail ne se
  //   confondent pas (clés 'c:m:<id>' vs 'c:m:<mail>' disjointes) — c'est voulu, pas une erreur.
  const ip = clientIp(event);
  const t = await verifierThrottle(ip, vt.id);
  if (t.bloque) return { statusCode: 429, headers: { ...headers, 'Retry-After': String(t.retryAfter || 1) }, body: JSON.stringify({ ok: false, error: 'Trop de tentatives, réessayez dans un instant' }) };

  // Garde : contact actif ET marque ouverte (révocation ~60 s). Panne → 503 ; révoqué/fermé → 401 (re-login).
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };

  // Validation du NOUVEAU code (la valeur du client, jamais journalisée).
  const nc = String(body.newCode == null ? '' : body.newCode).trim();
  if (nc.length < MIN_CODE) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Code trop court (au moins ' + MIN_CODE + ' caractères)' }) };
  if (/^(.)\1*$/.test(nc)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Choisissez un code moins simple' }) };
  const oc = String(body.oldCode == null ? '' : body.oldCode).trim();

  try {
    // Fiche FRAÎCHE (hors cache) : comparer l'ancien code, borner le parent, puis écrire. ⛔ la valeur lue ne
    // sort jamais d'ici (ni log, ni réponse) : seul le booléen de comparaison agit.
    const r = await nf('/pages/' + vt.id, 'GET', token);
    if (r.status === 404) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
    if (!r.ok) throw new Error('GET ' + r.status);
    const page = await r.json();
    if (!page.parent || normId(page.parent.database_id) !== normId(dbId)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };
    if (_rt(page.properties, 'Code acces') !== oc) {
      await enregistrerEchec(ip, vt.id);
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Code actuel incorrect' }) };
    }
    const w = await nf('/pages/' + vt.id, 'PATCH', token, { properties: { 'Code acces': { rich_text: [{ text: { content: nc } }] } } });
    if (!w.ok) throw new Error('PATCH ' + w.status);
    await enregistrerSucces(ip, vt.id);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }; // ⛔ réponse NUE : ni nouveau code, ni ancien, ni longueur
  } catch (e) {
    // ⛔ marqueur fixe + NOM de l'erreur seulement, JAMAIS e.message : depuis Node 20, une erreur de parsing JSON
    //   inclut un EXTRAIT du corps reçu — ici une page Notion, Code acces compris. Le nom ne porte aucune donnée.
    console.error('code-client indispo (' + (e && e.name || 'Error') + ')');
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
