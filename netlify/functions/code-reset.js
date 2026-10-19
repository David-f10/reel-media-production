// netlify/functions/code-reset.js
// Réinitialise le code d'accès d'un membre. Depuis la 1/3, les codes ne descendent plus côté client :
// c'est la SEULE façon de récupérer un code sans ouvrir Notion.
//   - Appelant vérifié ET porteur de la clé (peutGererAcces).
//   - Génère un code IMPRÉVISIBLE (crypto) — surtout pas 'prénom+26', motif devinable de la création.
//   - L'écrit sur Notion en direct, et le renvoie UNE fois à celui qui a cliqué. Jamais stocké ailleurs.

const crypto = require('crypto');
const { verifyUser } = require('./_auth');

// 8 caractères d'un alphabet sans ambigus (pas de O/0, I/1, L). ~40 bits → non devinable.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genererCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
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

  const rid   = (event.headers && (event.headers['x-rm-id']   || event.headers['X-Rm-Id']))   || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || auth.user.peutGererAcces !== true) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires d\'accès' }) };
  }

  const targetId = String(body.targetId || '').trim();
  if (!targetId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'targetId manquant' }) };
  }

  const code = genererCode();
  try {
    const res = await fetch('https://api.notion.com/v1/pages/' + targetId, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: { 'Code acces': { rich_text: [{ text: { content: code } }] } } })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: e.message || 'Notion ' + res.status }) };
    }
    // Renvoyé UNE fois. Le client l'affiche, ne le stocke jamais.
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, code }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
