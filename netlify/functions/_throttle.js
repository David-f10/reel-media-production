// netlify/functions/_throttle.js
// Lot G tranche 1 (2bis) — limitation des tentatives de connexion de l'espace client, SANS base de données
// ni service externe (Netlify Blobs, déjà dans la stack). Politique validée :
//   • PAR IP = verrou FERME, autoritaire et PARTAGÉ entre instances (Blobs). L'attaquant paie ; bloquer
//     une IP ne verrouille aucun compte. Verrou caché en mémoire par instance → zéro lecture Blobs tant
//     qu'une IP est verrouillée.
//   • PAR MAIL = ralentissement PROGRESSIF, JAMAIS de verrou sec, et EN MÉMOIRE par instance seulement
//     (soft) : un attaquant qui pilonne l'adresse d'un vrai client le ralentit sans jamais l'enfermer
//     dehors (au pire ~30 s). Per-instance est acceptable pour une mesure clémente ; les dents, c'est le
//     verrou IP (Blobs) + la LONGUEUR du code (hors de ce module).
// FAIL-OPEN : Blobs indisponible/non configuré → le throttle ne bloque rien (verifyClient protège encore).
// Dosage quota : lecture d'abord, écriture SEULEMENT sur échec (changement d'état) ; succès = reset mémoire,
// aucune écriture Blobs.

const { getThrottleStore } = require('./_blobs');

const IP_WINDOW_MS = 10 * 60 * 1000, IP_SEUIL = 10, IP_LOCK_MS = 15 * 60 * 1000;
const MAIL_WINDOW_MS = 10 * 60 * 1000, MAIL_CAP_S = 30;
const normMail = (s) => String(s == null ? '' : s).trim().toLowerCase();

const _ipLock = new Map(); // ip -> lockedUntil (cache instance du verrou ferme Blobs)
const _mail = new Map();   // mail -> { c, last } (ralentissement progressif, PAR INSTANCE)

function _store() { try { return getThrottleStore(); } catch (e) { return null; } } // non configuré → fail-open
// délai (s) par mail selon le nb d'échecs : 0,0,2,4,8,16,30(cap)…
function _cooldownMail(c) { return c <= 2 ? 0 : Math.min(MAIL_CAP_S, Math.pow(2, c - 2)); }

// À appeler AVANT verifyClient. → { bloque:bool, retryAfter?:s }.
async function verifierThrottle(ip, mail) {
  const now = Date.now();
  if (ip) { const u = _ipLock.get(ip); if (u && u > now) return { bloque: true, retryAfter: Math.ceil((u - now) / 1000) }; if (u) _ipLock.delete(ip); }
  const store = _store();
  if (store && ip) {
    try {
      const e = await store.get('ip:' + ip, { type: 'json' });
      if (e && e.until && e.until > now) { _ipLock.set(ip, e.until); return { bloque: true, retryAfter: Math.ceil((e.until - now) / 1000) }; }
    } catch (e) { console.error('throttle ip read : ' + (e && e.message || '')); } // fail-open
  }
  const m = normMail(mail);
  if (m) { const e = _mail.get(m); if (e && (now - e.last) < MAIL_WINDOW_MS) { const reste = _cooldownMail(e.c) * 1000 - (now - e.last); if (reste > 0) return { bloque: true, retryAfter: Math.ceil(reste / 1000) }; } }
  return { bloque: false };
}

// À appeler sur un ÉCHEC d'identifiants (raison:'auth'). Incrémente mail (mémoire) + IP (Blobs, + verrou au seuil).
async function enregistrerEchec(ip, mail) {
  const now = Date.now();
  const m = normMail(mail);
  if (m) { let e = _mail.get(m); if (!e || (now - e.last) > MAIL_WINDOW_MS) e = { c: 0, last: now }; e.c++; e.last = now; _mail.set(m, e); }
  const store = _store();
  if (store && ip) {
    try {
      let e = await store.get('ip:' + ip, { type: 'json' }).catch(() => null);
      if (!e || (now - (e.t || 0)) > IP_WINDOW_MS) e = { c: 0, t: now };
      e.c++;
      if (e.c >= IP_SEUIL) { e.until = now + IP_LOCK_MS; _ipLock.set(ip, e.until); }
      await store.setJSON('ip:' + ip, e);
    } catch (e) { console.error('throttle ip write : ' + (e && e.message || '')); }
  }
}

// À appeler sur un SUCCÈS (login client). Reset mémoire du mail ; aucune écriture Blobs. IP laissée.
function enregistrerSucces(ip, mail) { const m = normMail(mail); if (m) _mail.delete(m); }

module.exports = { verifierThrottle, enregistrerEchec, enregistrerSucces };
