// netlify/functions/_clienttoken.js
// Lot G (F1) — jeton de SESSION client, signé HMAC, SANS ÉTAT. Charge utile = IDENTITÉ ({ id du contact,
// exp }), surtout PAS le Code Brand ni Actif — ceux-là restent relus en live par projets-client
// (révocation ~60 s préservée). Le jeton remplace le stockage du code côté client : le code ne transite
// qu'une fois, au login.
//
// EMPRUNT CHEF (lot 1, lecture seule) — deux marqueurs OPTIONNELS, ajoutés DANS la charge SIGNÉE donc
// infalsifiables : `ro` (session en lecture seule) et `acteur` (id du chef emprunteur, pour l'audit). Un
// VRAI jeton client ne les porte pas → `ro:false`, et sa charge reste byte-identique à avant. Le refus
// d'écriture ne se lit JAMAIS dans le navigateur : il vit côté serveur, où tout mutation passe par
// _notionio.appelNotion, qui rejette dès qu'un jeton ro tente autre chose qu'une lecture.
//
// Secret : env CLIENT_SIGN_SECRET, DISTINCTE de REVIEW_SIGN_SECRET (un jeton client ne doit jamais valoir
// comme un jeton review). ABSENTE → FAIL-CLOSED : on ne signe ni ne vérifie rien ({ ok:false, raison:'config' }),
// l'appelant rend 503 + un log de présence booléen. Jamais de jeton non signé, jamais de repli.
//
// Format : base64url(payload).base64url(HMAC-SHA256(payload)). TTL par défaut 14 j ; un emprunt le réduit
// (opts.ttlMs, ~15 min) sans renouvellement glissant.

const crypto = require('crypto');

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const _secret = () => process.env.CLIENT_SIGN_SECRET || '';
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const _sig = (p, secret) => b64u(crypto.createHmac('sha256', secret).update(p).digest());

// signer(id, opts?) → { ok:true, token } | { ok:false, raison:'config' }
// opts (emprunt chef) : { ro:true, acteur:<id chef>, ttlMs:<durée courte> }. Absent → jeton client normal,
// charge { id, exp } inchangée. ro/acteur ne sont ajoutés que s'ils sont fournis (jeton normal byte-identique).
function signer(id, opts) {
  const secret = _secret();
  if (!secret) return { ok: false, raison: 'config' };
  const o = opts || {};
  const ttl = (typeof o.ttlMs === 'number' && o.ttlMs > 0) ? o.ttlMs : TTL_MS;
  const charge = { id: String(id), exp: Date.now() + ttl };
  if (o.ro) charge.ro = 1;                       // marqueur lecture seule (signé → infalsifiable)
  if (o.acteur) charge.acteur = String(o.acteur); // id du chef emprunteur (audit / estampille)
  const p = b64u(JSON.stringify(charge));
  return { ok: true, token: p + '.' + _sig(p, secret) };
}

// verifier(token) → { ok:true, id, ro, acteur } | { ok:false, raison:'config'|'invalide'|'expire' }
// ro/acteur : additifs, lus depuis la charge signée. Un jeton normal → ro:false, acteur:''.
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
  return { ok: true, id: String(payload.id), ro: !!payload.ro, acteur: payload.acteur ? String(payload.acteur) : '' };
}

module.exports = { signer, verifier };
