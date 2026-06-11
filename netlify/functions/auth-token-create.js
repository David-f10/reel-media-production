// netlify/functions/auth-token-create.js
// Crée un jeton éphémère d'auto-login pour passer la session de la PWA au navigateur externe.
//   - Vérifie (id, code) via _auth.js (même mécanisme que login.js).
//   - Génère un jeton aléatoire 256 bits (base64url).
//   - Stocke { user, createdAt, expiresAt } dans Netlify Blobs (store "auth-tokens") avec TTL 120s.
//   - Cleanup opportuniste des jetons expirés.
//   - Retourne le jeton (jamais le code).

const crypto = require('crypto');
const { verifyUser } = require('./_auth');
const { getAuthTokenStore } = require('./_blobs');

const TTL_MS = 120 * 1000; // 120 secondes

async function cleanupExpired(store, now) {
  try {
    const list = await store.list();
    const blobs = list?.blobs || [];
    const expired = [];
    for (const b of blobs) {
      const entry = await store.get(b.key, { type: 'json' });
      if (entry && typeof entry.expiresAt === 'number' && entry.expiresAt < now - 60000) {
        expired.push(b.key);
      }
    }
    await Promise.all(expired.map(k => store.delete(k).catch(() => {})));
  } catch (e) {
    // Cleanup best-effort : un échec ne doit pas casser la création
  }
}

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

  const { id, code } = body;
  if (!id || !code) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants' }) };
  }

  const auth = await verifyUser({ id, code });
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: auth.error || 'Code incorrect' }) };
  }

  try {
    const store = getAuthTokenStore();
    const now = Date.now();
    const token = crypto.randomBytes(32).toString('base64url');
    await store.setJSON(token, {
      user: auth.user,
      createdAt: now,
      expiresAt: now + TTL_MS
    });
    // Cleanup best-effort en arrière-plan, non bloquant pour la réponse
    cleanupExpired(store, now).catch(() => {});
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token, ttlMs: TTL_MS }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error: ' + e.message }) };
  }
};
