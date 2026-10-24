// netlify/functions/login-client.js
// Lot G tranche 1 — connexion de l'espace client (écran 04). Vérifie (mail, code) via _authclient, DISTINCT
// de login.js (équipe), non touché. Message d'erreur GÉNÉRIQUE et identique que le mail existe ou non
// (anti-énumération). Panne → 503 « temporairement indisponible », jamais un refus. Ne renvoie aucune
// donnée de périmètre. Protégé par _throttle (IP ferme / mail progressif). CORS restreint à l'origine du site.

const { verifyClient } = require('./_authclient');
const { verifierThrottle, enregistrerEchec, enregistrerSucces } = require('./_throttle');

// CORS : reflète l'Origin seulement si c'est le site (SITE_ORIGIN) ou un *.netlify.app. Sinon pas d'en-tête
// (le même-origine de client.html n'en a pas besoin). Protection navigateur uniquement — curl l'ignore.
function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const site = process.env.SITE_ORIGIN || '';
  if (o && (o === site || /^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(o))) return o;
  return '';
}
function clientIp(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || '').trim() || String(h['x-forwarded-for'] || '').split(',')[0].trim() || '';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const ip = clientIp(event);
  const mail = body.mail;

  const t = await verifierThrottle(ip, mail);
  if (t.bloque) {
    return { statusCode: 429, headers: { ...headers, 'Retry-After': String(t.retryAfter || 1) }, body: JSON.stringify({ ok: false, error: 'Trop de tentatives, réessayez dans un instant' }) };
  }

  const v = await verifyClient({ mail, code: body.code });
  if (v.ok) {
    enregistrerSucces(ip, mail);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, nom: v.contact.nom }) };
  }
  if (v.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  await enregistrerEchec(ip, mail);
  return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Mail ou code incorrect' }) }; // GÉNÉRIQUE
};
