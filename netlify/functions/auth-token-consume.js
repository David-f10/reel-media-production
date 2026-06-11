// netlify/functions/auth-token-consume.js
// Consomme un jeton éphémère d'auto-login (créé par auth-token-create).
// Usage unique strict via suppression atomique avant de retourner.
//   - Token absent → 404
//   - Token expiré → delete + 410
//   - Sinon → delete, retourne { ok, user }

const { getAuthTokenStore } = require('./_blobs');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const { token } = body;
  if (!token || typeof token !== 'string' || token.length < 10 || token.length > 200) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Jeton invalide' }) };
  }

  let store;
  try { store = getAuthTokenStore(); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error: ' + e.message }) }; }

  let entry;
  try { entry = await store.get(token, { type: 'json' }); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error: ' + e.message }) }; }

  if (!entry) {
    return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Jeton inexistant' }) };
  }

  // Vérification d'expiration
  if (typeof entry.expiresAt !== 'number' || Date.now() > entry.expiresAt) {
    await store.delete(token).catch(() => {});
    return { statusCode: 410, headers, body: JSON.stringify({ ok: false, error: 'Jeton expiré' }) };
  }

  // Suppression atomique AVANT de retourner — garantit l'usage unique strict
  try { await store.delete(token); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error: ' + e.message }) }; }

  if (!entry.user || !entry.user.id || !entry.user.nom) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Entrée corrompue' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, user: entry.user }) };
};
