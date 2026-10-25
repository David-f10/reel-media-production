// netlify/functions/login-client.js
// Lot G tranche 1 — connexion de l'espace client (écran 04). Vérifie (mail, code) via _authclient, DISTINCT
// de login.js (équipe), non touché. Message d'erreur GÉNÉRIQUE et identique que le mail existe ou non
// (anti-énumération). Panne → 503 « temporairement indisponible », jamais un refus. Ne renvoie aucune
// donnée de périmètre. Protégé par _throttle (IP ferme / mail progressif). CORS restreint à l'origine du site.

const { verifyClient } = require('./_authclient');
const { verifierThrottle, enregistrerEchec, enregistrerSucces } = require('./_throttle');
const { signer } = require('./_clienttoken');

// CORS (F4) : reflète l'Origin UNIQUEMENT si c'est notre hôte exact ou SITE_ORIGIN (domaine custom éventuel).
// Plus de regex large *.netlify.app (qui acceptait n'importe quel site Netlify). client.html est
// même-origine → n'a de toute façon pas besoin de CORS ; ceci ne sert qu'à un éventuel front custom.
// Protection navigateur uniquement — curl l'ignore.
function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
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
    // F1 : on émet un JETON DE SESSION signé (identité seule). Secret absent → fail-closed 503 + log booléen,
    // jamais de repli sur l'ancien mécanisme. Le code n'est PAS renvoyé : il ne doit plus subsister côté client.
    const jeton = signer(v.contact.id);
    if (!jeton.ok) {
      console.error('login-client indispo : CLIENT_SIGN_SECRET=' + !!process.env.CLIENT_SIGN_SECRET);
      return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    }
    await enregistrerSucces(ip, mail); // async (efface le compteur mail dans Blobs)
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token: jeton.token, nom: v.contact.nom, marque: v.contact.marque || '' }) };
  }
  if (v.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  await enregistrerEchec(ip, mail);
  return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Mail ou code incorrect' }) }; // GÉNÉRIQUE
};
