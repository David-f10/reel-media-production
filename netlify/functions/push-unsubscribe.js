// netlify/functions/push-unsubscribe.js
// Retire une subscription (par endpoint) d'un utilisateur.
// Appelé au logout côté client.
// Pas d'exigence d'auth code ici : on retire uniquement par endpoint connu —
// c'est un nettoyage volontaire de device, pas une action privilégiée.

const { getPushStore } = require('./_blobs');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const { nom, endpoint } = body;
  if (!nom || !endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'nom et endpoint requis' }) };
  }

  try {
    const store = getPushStore();
    const existing = (await store.get(nom, { type: 'json' })) || [];
    const filtered = existing.filter(s => s && s.endpoint !== endpoint);
    if (filtered.length === 0) {
      await store.delete(nom);
    } else {
      await store.setJSON(nom, filtered);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, remaining: filtered.length }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error: ' + e.message }) };
  }
};
