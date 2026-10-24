// netlify/functions/login-client.js
// Lot G tranche 1 — connexion de l'espace client (écran 04). Vérifie (mail, code) via _authclient, DISTINCT
// de login.js (équipe), qui n'est pas touché. Message d'erreur GÉNÉRIQUE et identique que le mail existe ou
// non (anti-énumération). Une panne (indispo) rend 503 « temporairement indisponible », jamais un refus.
// Ne renvoie aucune donnée de périmètre : juste l'accès et le nom pour l'accueil.

const { verifyClient } = require('./_authclient');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const v = await verifyClient({ mail: body.mail, code: body.code });
  if (v.ok) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, nom: v.contact.nom }) };
  if (v.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Mail ou code incorrect' }) }; // GÉNÉRIQUE
};
