// netlify/functions/_streamcookie.js
// Helpers PURS du relais vidéo (drive-stream) — aucune E/S, isolés pour être testés sans Drive ni Blobs.
// Le préfixe '_' évite l'exposition comme function Netlify.
//
// Cookie de flux : signé HMAC, porté en HttpOnly (jamais dans l'URL). Charge = { fid, cid, exp } :
//   fid = fileId de LA version autorisée (le relais ne sert QUE ce fichier — jamais un fileId de la requête) ;
//   cid = identifiant du contact (garde-fou de consommation) ; exp = expiration (ms).
// Vérification = signature + expiration, LOCALE, sans aucun appel Notion/réseau.

const crypto = require('crypto');

const COOKIE_NOM = 'rmv';
const B64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const DEB64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function signerValeur(payload, secret) {
  const corps = B64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(corps).digest('hex');
  return corps + '.' + sig;
}

function verifierValeur(valeur, secret, maintenant) {
  const s = String(valeur || ''); const i = s.indexOf('.');
  if (i < 0) return null;
  const corps = s.slice(0, i), sig = s.slice(i + 1);
  const bon = crypto.createHmac('sha256', secret).update(corps).digest('hex');
  let okSig = false;
  try { okSig = sig.length === bon.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(bon)); } catch (e) { okSig = false; }
  if (!okSig) return null;
  let payload; try { payload = JSON.parse(DEB64(corps)); } catch (e) { return null; }
  if (!payload || !payload.exp || (maintenant || Date.now()) > payload.exp) return null;
  if (!payload.fid) return null;
  return payload;
}

// Lit la valeur du cookie rmv dans un en-tête Cookie brut. '' si absent.
function lireCookie(cookieHeader) {
  const h = String(cookieHeader || '');
  const m = h.match(new RegExp('(?:^|;\\s*)' + COOKIE_NOM + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// Construit l'en-tête Set-Cookie : HttpOnly, Secure, SameSite=Lax, Path limité au relais, Max-Age court.
function construireSetCookie(valeur, maxAgeSec) {
  return COOKIE_NOM + '=' + encodeURIComponent(valeur) +
    '; Max-Age=' + Math.max(1, Math.floor(maxAgeSec)) +
    '; Path=/.netlify/functions/drive-stream; HttpOnly; Secure; SameSite=Lax';
}

// Plage demandée par le <video>, CAPÉE à `cap` octets (tenir sous le plafond de réponse Netlify). Pur.
// rangeHeader ex. « bytes=1000-  » ou « bytes=1000-2000 » ou absent. Renvoie { start, end } (inclusifs).
function construireRange(rangeHeader, cap) {
  const m = /bytes=(\d+)-(\d*)/.exec(String(rangeHeader || ''));
  const start = m ? parseInt(m[1], 10) : 0;
  const demEnd = (m && m[2]) ? parseInt(m[2], 10) : (start + cap - 1);
  const end = Math.min(demEnd, start + cap - 1);
  return { start: start < 0 ? 0 : start, end: end < start ? start : end };
}

// Garde-fou COARSE : faut-il compter cette requête ? Oui seulement quand `start` entre dans un nouveau palier
// de `pas` octets (≈ une fois par palier, pas par tranche → ne pèse pas sur la fluidité).
function doitCompter(start, cap, pas) {
  return (start % pas) < cap; // le premier chunk de chaque palier déclenche le comptage
}

module.exports = {
  COOKIE_NOM, signerValeur, verifierValeur, lireCookie, construireSetCookie, construireRange, doitCompter,
  _test: { signerValeur, verifierValeur, lireCookie, construireSetCookie, construireRange, doitCompter }
};
