// netlify/functions/push-config.js
// Renvoie la clé publique VAPID au client (utile pour pushManager.subscribe).
// La clé est dans process.env, jamais en dur dans le code source.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const pub = process.env.VAPID_PUBLIC_KEY;
  if (!pub) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'VAPID_PUBLIC_KEY manquante' }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ publicKey: pub }) };
};
