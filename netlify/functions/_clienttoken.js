// netlify/functions/_clienttoken.js
// Lot G (F1) — jeton de SESSION client, signé HMAC, SANS ÉTAT. Charge utile = IDENTITÉ SEULE
// ({ id du contact, exp }). Rien d'autre : surtout PAS le Code Brand ni Actif — ceux-là restent relus
// en live par projets-client (révocation ~60 s préservée). Le jeton remplace le stockage du code côté
// client : le code ne transite qu'une fois, au login.
//
// Secret : env CLIENT_SIGN_SECRET, DISTINCTE de REVIEW_SIGN_SECRET (un jeton client ne doit jamais valoir
// comme un jeton review). ABSENTE → FAIL-CLOSED : on ne signe ni ne vérifie rien ({ ok:false, raison:'config' }),
// l'appelant rend 503 + un log de présence booléen. Jamais de jeton non signé, jamais de repli.
//
// Format : base64url(payload).base64url(HMAC-SHA256(payload)). TTL FIXE 14 j, pas de renouvellement glissant.

const crypto = require('crypto');

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const _secret = () => process.env.CLIENT_SIGN_SECRET || '';
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _sig = (p, secret) => b64u(crypto.createHmac('sha256', secret).update(p).digest());

// signer(id) → { ok:true, token } | { ok:false, raison:'config' }
function signer(id) {
  const secret = _secret();
  if (!secret) return { ok: false, raison: 'config' };
  const p = b64u(JSON.stringify({ id: String(id), exp: Date.now() + TTL_MS }));
  return { ok: true, token: p + '.' + _sig(p, secret) };
}

// verifier(token) → { ok:true, id } | { ok:false, raison:'config'|'invalide'|'expire' }
function verifier(token) {
  const secret = _secret();
  if (!secret) return { ok: false, raison: 'config' };
  if (!token || typeof token !== 'string') return { ok: false, raison: 'invalide' };
  const pt = token.indexOf('.');
  if (pt < 1) return { ok: false, raison: 'invalide' };
  const p = token.slice(0, pt), sig = token.slice(pt + 1);
  const attendu = _sig(p, secret);
  const a = Buffer.from(sig), b = Buffer.from(attendu);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, raison: 'invalide' }; // comparaison à temps constant
  let payload;
  try { payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); }
  catch (e) { return { ok: false, raison: 'invalide' }; }
  if (!payload || !payload.id || !payload.exp) return { ok: false, raison: 'invalide' };
  if (Date.now() > payload.exp) return { ok: false, raison: 'expire' };
  return { ok: true, id: String(payload.id) };
}

module.exports = { signer, verifier };
