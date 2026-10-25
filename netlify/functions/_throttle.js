// netlify/functions/_throttle.js
// Lot G — limitation des tentatives de connexion de l'espace client, SANS base ni service externe (Netlify
// Blobs, déjà dans la stack). Politique validée :
//   • PAR IP = verrou FERME, PARTAGÉ entre instances (Blobs). L'attaquant paie ; bloquer une IP ne
//     verrouille aucun compte. Verrou caché en mémoire par instance → 0 lecture Blobs tant qu'une IP est
//     verrouillée.
//   • PAR MAIL = ralentissement PROGRESSIF (0,0,2,4,8,16,30 s cap), JAMAIS de verrou sec → un attaquant qui
//     pilonne l'adresse d'un vrai client le ralentit sans jamais l'enfermer dehors (au pire ~30 s).
//     DÉSORMAIS PERSISTÉ dans Blobs comme l'IP (F3) : on ne laisse pas la protection dépendre d'une mémoire
//     par instance qu'on ne sait pas observer.
// FAIL-OPEN : Blobs indisponible/non configuré → le throttle ne bloque rien (verifyClient protège encore),
//   MAIS c'est désormais LOGGÉ une fois (F2) — plus de protection silencieusement absente.
// Dépendance IP : le verrou ferme exige un vrai IP client ; en-tête vide → loggé une fois (F6).
// Dosage quota : écriture Blobs seulement sur échec / succès (changement d'état).

const { getThrottleStore } = require('./_blobs');

const IP_WINDOW_MS = 10 * 60 * 1000, IP_SEUIL = 10, IP_LOCK_MS = 15 * 60 * 1000;
const MAIL_WINDOW_MS = 10 * 60 * 1000, MAIL_CAP_S = 30;
const normMail = (s) => String(s == null ? '' : s).trim().toLowerCase();

const _ipLock = new Map(); // ip -> lockedUntil (cache instance du verrou ferme Blobs)
let _logStoreIndispo = false, _logIpVide = false; // F2 / F6 : un seul log par instance, pas de flood

function _store() {
  try { return getThrottleStore(); }
  catch (e) {
    if (!_logStoreIndispo) { // F2
      console.error('throttle : store Blobs indisponible (NETLIFY_SITE_ID / NETLIFY_BLOBS_TOKEN ?) — throttle INACTIF, fail-open');
      _logStoreIndispo = true;
    }
    return null;
  }
}
// délai (s) par mail selon le nb d'échecs : 0,0,2,4,8,16,30(cap)…
function _cooldownMail(c) { return c <= 2 ? 0 : Math.min(MAIL_CAP_S, Math.pow(2, c - 2)); }

// À appeler AVANT verifyClient. → { bloque:bool, retryAfter?:s }.
async function verifierThrottle(ip, mail) {
  const now = Date.now();
  if (!ip && !_logIpVide) { // F6
    console.error('throttle : en-tête IP client vide (x-nf-client-connection-ip absent) — verrou IP INACTIF');
    _logIpVide = true;
  }
  if (ip) { const u = _ipLock.get(ip); if (u && u > now) return { bloque: true, retryAfter: Math.ceil((u - now) / 1000) }; if (u) _ipLock.delete(ip); }
  const store = _store();
  if (!store) return { bloque: false }; // fail-open (loggé une fois dans _store)
  if (ip) {
    try {
      const e = await store.get('ip:' + ip, { type: 'json' });
      if (e && e.until && e.until > now) { _ipLock.set(ip, e.until); return { bloque: true, retryAfter: Math.ceil((e.until - now) / 1000) }; }
    } catch (e) { console.error('throttle ip read : ' + (e && e.message || '')); } // fail-open
  }
  const m = normMail(mail);
  if (m) {
    try {
      const e = await store.get('m:' + m, { type: 'json' });
      if (e && e.last && (now - e.last) < MAIL_WINDOW_MS) {
        const reste = _cooldownMail(e.c || 0) * 1000 - (now - e.last);
        if (reste > 0) return { bloque: true, retryAfter: Math.ceil(reste / 1000) };
      }
    } catch (e) { console.error('throttle mail read : ' + (e && e.message || '')); } // fail-open
  }
  return { bloque: false };
}

// À appeler sur un ÉCHEC d'identifiants (raison:'auth'). Incrémente mail ET IP dans Blobs (+ verrou IP au seuil).
async function enregistrerEchec(ip, mail) {
  const now = Date.now();
  const store = _store();
  if (!store) return;
  if (ip) {
    try {
      let e = await store.get('ip:' + ip, { type: 'json' }).catch(() => null);
      if (!e || (now - (e.t || 0)) > IP_WINDOW_MS) e = { c: 0, t: now };
      e.c++;
      if (e.c >= IP_SEUIL) { e.until = now + IP_LOCK_MS; _ipLock.set(ip, e.until); }
      await store.setJSON('ip:' + ip, e);
    } catch (e) { console.error('throttle ip write : ' + (e && e.message || '')); }
  }
  const m = normMail(mail);
  if (m) {
    try {
      let e = await store.get('m:' + m, { type: 'json' }).catch(() => null);
      if (!e || (now - (e.last || 0)) > MAIL_WINDOW_MS) e = { c: 0, last: now };
      e.c++; e.last = now;
      await store.setJSON('m:' + m, e);
    } catch (e) { console.error('throttle mail write : ' + (e && e.message || '')); }
  }
}

// À appeler sur un SUCCÈS (login client). Efface le compteur mail dans Blobs. IP laissée. Best-effort.
async function enregistrerSucces(ip, mail) {
  const store = _store();
  if (!store) return;
  const m = normMail(mail);
  if (m) { try { await store.delete('m:' + m); } catch (e) { /* best-effort */ } }
}

module.exports = { verifierThrottle, enregistrerEchec, enregistrerSucces };
