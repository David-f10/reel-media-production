// netlify/functions/projets-client.js
// Lot G tranche 1 — liste des projets de la marque du client (écran 05, brut). SÉCURITÉ :
//  • identité RE-VÉRIFIÉE à CHAQUE appel (verifyClient), jamais de confiance au navigateur ;
//  • périmètre DÉRIVÉ CÔTÉ SERVEUR du Code Brand du contact — le client n'envoie aucun code marque ni id ;
//  • réserve 2 : un ÉCHEC (auth indispo, ou calcul de périmètre en échec) ne rend JAMAIS une liste vide —
//    il rend 401/503 pour que l'écran dise « temporairement indisponible », jamais « aucun projet » ;
//  • throttle (_throttle) : cet endpoint vérifie aussi des identifiants, donc il est un oracle de brute-force
//    au même titre que login-client → même protection IP ferme / mail progressif.
// N'utilise PAS le proxy équipe (notion.js). CORS restreint à l'origine du site.

const { verifyClient } = require('./_authclient');
const { projetsDeMarque } = require('./_perimetreclient');
const { verifierThrottle, enregistrerEchec } = require('./_throttle');

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
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-mail, x-rmc-code',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const h = event.headers || {};
  const mail = h['x-rmc-mail'] || h['X-Rmc-Mail'] || '';
  const code = h['x-rmc-code'] || h['X-Rmc-Code'] || '';
  const ip = clientIp(event);

  const t = await verifierThrottle(ip, mail);
  if (t.bloque) {
    return { statusCode: 429, headers: { ...headers, 'Retry-After': String(t.retryAfter || 1) }, body: JSON.stringify({ ok: false, error: 'Trop de tentatives, réessayez dans un instant' }) };
  }

  const v = await verifyClient({ mail, code });
  if (!v.ok) {
    if (v.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    await enregistrerEchec(ip, mail);
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  }

  // Code Brand pris SUR LE CONTACT authentifié, jamais sur la requête.
  const res = await projetsDeMarque(v.contact.codeBrand, process.env.NOTION_TOKEN);
  if (!res.ok) {
    // Échec de calcul → surtout PAS { projets: [] }. Statut distinguable d'un vrai vide (réserve 2).
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, projets: res.projets }) };
};
