// netlify/functions/client-emprunt-consume.js
// Lot 1 (entrée) — CONSOMME la remise d'emprunt créée par client-emprunt-create. Usage unique strict
// (suppression atomique avant de retourner), même patron que auth-token-consume. Rend le jeton de session
// ro et son expiration (pour le décompte du bandeau) ; jamais le code, jamais rien de l'équipe.
//   - Remise absente → 404 ; expirée → delete + 410 ; sinon → delete, { ok, token, exp, marque, nom }.

const { getEmpruntTokenStore } = require('./_blobs');

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

  const token = body.token;
  if (!token || typeof token !== 'string' || token.length < 10 || token.length > 200) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Remise invalide' }) };
  }

  let store;
  try { store = getEmpruntTokenStore(); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error' }) }; }

  let entry;
  try { entry = await store.get(token, { type: 'json' }); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error' }) }; }

  if (!entry) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Lien d\'emprunt inexistant' }) };

  if (typeof entry.expiresAt !== 'number' || Date.now() > entry.expiresAt) {
    await store.delete(token).catch(() => {});
    return { statusCode: 410, headers, body: JSON.stringify({ ok: false, error: 'Lien d\'emprunt expiré' }) };
  }

  // Suppression atomique AVANT de retourner — usage unique strict.
  try { await store.delete(token); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error' }) }; }

  if (!entry.jeton) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Entrée corrompue' }) };

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token: entry.jeton, exp: entry.exp || 0, marque: entry.marque || '', nom: entry.nom || '' }) };
};
