// netlify/functions/review-sign.js
// Signe un lien de visionnage client (jeton de review lié à un sujet). SIGNATURE SERVER-SIDE : la clé
// REVIEW_SIGN_SECRET ne doit jamais atteindre le navigateur, donc index.html appelle cette fonction.
//   - Entrée : POST { sujetId, code } + en-têtes d'identité (x-rm-id, x-rm-code).
//   - SEUL un membre authentifié de l'équipe peut signer un lien (verifyUser).
//   - Sortie : { ok:true, t } — le jeton. Jamais le secret, jamais un code d'accès.

const { verifyUser } = require('./_auth');
const { signReview } = require('./_review');

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

  const sujetId = String(body.sujetId || '').trim();
  const code = String(body.code || '').trim();
  if (!sujetId || !code) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (sujetId, code)' }) };
  }

  // Identité équipe obligatoire pour signer.
  const rid   = (event.headers && (event.headers['x-rm-id']   || event.headers['X-Rm-Id']))   || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Identité requise' }) };
  }

  if (!process.env.REVIEW_SIGN_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'REVIEW_SIGN_SECRET manquant' }) };
  }

  try {
    const t = signReview({ code, sujetId });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, t }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Signature impossible' }) };
  }
};
