// netlify/functions/_review.js
// Jeton de review SIGNÉ (HMAC-SHA256), lié à UN sujet. Le préfixe '_' évite l'exposition en function.
// Un lien de visionnage client porte ce jeton (&t=…) ; il n'ouvre QUE son propre sujet, et un lien
// fabriqué à la main (code de sujet deviné) est refusé faute de signature valide.
//
// Format compact (mini-JWT) : payload '.' signature
//   payload   = base64url(JSON { c: <code sujet>, i: <id page sujet>, e: <exp epoch s> })
//   signature = base64url(HMAC_SHA256(REVIEW_SIGN_SECRET, payload))
//
// Clé = REVIEW_SIGN_SECRET (variable d'env DÉDIÉE — jamais NOTION_TOKEN : on n'utilise pas le jeton
// admin Notion comme clé de signature, pour isoler le rayon de compromission). La signer vit
// server-side (review-sign.js) ; la vérifier aussi (notion.js, puis notify/drive en 2/3b-2).

const crypto = require('crypto');

const TTL_JOURS_DEFAUT = 365; // 1 an : couvre « le client revient des mois plus tard » ; rotation du
                              // secret = révocation immédiate de TOUS les liens si besoin.

function _secret() {
  return process.env.REVIEW_SIGN_SECRET || '';
}

// Signe un lien pour (code, sujetId). Lève si le secret manque (fail-closed : jamais de lien non signé).
function signReview({ code, sujetId, ttlJours = TTL_JOURS_DEFAUT }) {
  const secret = _secret();
  if (!secret) throw new Error('REVIEW_SIGN_SECRET manquant');
  if (!code || !sujetId) throw new Error('Paramètres manquants (code, sujetId)');
  const exp = Math.floor(Date.now() / 1000) + ttlJours * 86400;
  const payload = Buffer.from(JSON.stringify({ c: String(code), i: String(sujetId), e: exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

// Vérifie un jeton. Renvoie { ok:true, code, sujetId, exp } ou { ok:false }.
// FAIL-CLOSED : toute anomalie (secret absent, signature fausse, JSON cassé, expiré) → { ok:false }.
// Comparaison de signature à TEMPS CONSTANT (timingSafeEqual).
function verifyReview(token) {
  try {
    const secret = _secret();
    if (!secret || typeof token !== 'string' || token.length < 8 || token.length > 2000) return { ok: false };
    const dot = token.indexOf('.');
    if (dot < 1 || dot >= token.length - 1) return { ok: false };
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.c !== 'string' || typeof data.i !== 'string' || typeof data.e !== 'number') return { ok: false };
    if (Math.floor(Date.now() / 1000) > data.e) return { ok: false }; // expiré
    return { ok: true, code: data.c, sujetId: data.i, exp: data.e };
  } catch (e) {
    return { ok: false };
  }
}

module.exports = { signReview, verifyReview };
