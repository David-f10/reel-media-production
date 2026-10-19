// netlify/functions/access-set.js
// Change le niveau d'accès (Accès) et/ou la clé (Peut gérer les accès) d'un AUTRE membre.
// Voie serveur dédiée parce que le proxy interdit ces écritures à TOUT le monde (PROPS_ELEVATION) —
// c'est précisément ce qui empêche une auto-promotion depuis la console.
//   - Appelant vérifié par verifyUser (x-rm-id / x-rm-code) ET porteur de la clé (peutGererAcces).
//   - JAMAIS sur soi-même (pas d'auto-élévation ni d'auto-rétrogradation accidentelle).
//   - Écrit en direct sur Notion avec NOTION_TOKEN (comme _auth.js / review-sign.js).

const { verifyUser } = require('./_auth');

const ACCES_VALIDES = ['Complet', 'Externe'];
// Notion traite un id AVEC ou SANS tirets comme la MÊME page → comparer les bruts laisserait passer
// son propre id dé-tireté et contournerait la garde d'auto-modification. On normalise des deux côtés.
const norm = (s) => String(s || '').replace(/-/g, '').toLowerCase();

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

  // Appelant : identifié ET porteur de la clé.
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
  // Pas de modification de son PROPRE accès/clé (anti auto-promotion, même avec la clé).
  // Comparaison NORMALISÉE : sinon le même id sans tirets viserait la même page en passant la garde.
  if (norm(targetId) === norm(auth.user.id)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'On ne modifie pas son propre accès' }) };
  }

  // Propriétés à écrire — seulement celles fournies.
  const props = {};
  if (body.acces !== undefined) {
    if (!ACCES_VALIDES.includes(body.acces)) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Accès invalide' }) };
    }
    props['Accès'] = { select: { name: body.acces } };
  }
  if (body.peutGererAcces !== undefined) {
    props['Peut gérer les accès'] = { checkbox: body.peutGererAcces === true };
  }
  if (Object.keys(props).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Rien à modifier' }) };
  }

  try {
    const res = await fetch('https://api.notion.com/v1/pages/' + targetId, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ properties: props })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: e.message || 'Notion ' + res.status }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
