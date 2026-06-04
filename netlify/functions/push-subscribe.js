// netlify/functions/push-subscribe.js
// Enregistre une PushSubscription pour un utilisateur authentifié.
// Sécurité : exige (id Notion + code) — vérification via _auth.js.
// Stockage : Netlify Blobs, store "push-subs", clé = nom du membre.
// Format de la valeur : array de subscriptions (multi-device).

const { getStore } = require('@netlify/blobs');
const { verifyUser } = require('./_auth');

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

  const { id, code, subscription } = body;
  if (!subscription || !subscription.endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'subscription manquante' }) };
  }

  const auth = await verifyUser({ id, code });
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: auth.error }) };
  }

  const nom = auth.user.nom;
  if (!nom) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Nom utilisateur introuvable' }) };
  }

  try {
    const store = getStore('push-subs');
    const existing = (await store.get(nom, { type: 'json' })) || [];
    // Déduplication par endpoint
    const filtered = existing.filter(s => s && s.endpoint !== subscription.endpoint);
    filtered.push({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      created: Date.now()
    });
    await store.setJSON(nom, filtered);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, devices: filtered.length }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Storage error: ' + e.message }) };
  }
};
