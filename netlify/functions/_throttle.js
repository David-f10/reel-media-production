// netlify/functions/_throttle.js
// Limitation des tentatives de connexion, partagée par les DEUX portes (client + équipe) via Netlify Blobs.
// PARAMÉTRÉE par une « police » : chaque porte a ses seuils, ses clés Blobs (préfixe DISTINCT → aucune
// collision entre portes) et, PAR AXE, le choix verrou-dur vs ralentissement progressif.
//
//   • Client (POLICE_CLIENT, défaut) : axe IP = verrou FERME (10 échecs/10 min → 15 min), axe secondaire
//     = mail, progressif. Les clients ont chacun leur IP → un verrou dur est un gain pur.
//   • Équipe (POLICE_EQUIPE) : les sept sont derrière UNE IP (NAT bureau). AUCUN verrou dur — ni sur l'IP
//     (il enfermerait tout le bureau) ni sur le compte (un attaquant enfermerait délibérément le porteur
//     de la clé « gère les accès »). Les DEUX axes sont progressifs : compte (id) 4 essais libres puis
//     5/10/20/30 s ; IP seuil haut (~30) puis 30 s plafond.
//
// FAIL-OPEN : Blobs indisponible → ne bloque rien (verifyUser/verifyClient protègent encore), loggé 1×.
// Dosage quota : écriture Blobs seulement sur échec / succès.

const { getThrottleStore } = require('./_blobs');

const W = 10 * 60 * 1000; // fenêtre commune : 10 min

const POLICE_CLIENT = {
  prefixe: 'c',
  ip:  { type: 'dur',  cle: 'ip', windowMs: W, seuil: 10, lockMs: 15 * 60 * 1000 },
  sec: { type: 'prog', cle: 'm',  windowMs: W, libres: 2, base: 2, capS: 30 }
};
const POLICE_EQUIPE = {
  prefixe: 'e',
  ip:  { type: 'prog', cle: 'ip', windowMs: W, libres: 30, base: 30, capS: 30 }, // NAT bureau : seuil haut, pas de lock
  sec: { type: 'prog', cle: 'id', windowMs: W, libres: 4, base: 5, capS: 30 }    // compte : 4 libres puis 5/10/20/30 s
};

const normMail = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _lockDur = new Map(); // clé Blobs → until (cache instance d'un verrou FERME)
let _logStoreIndispo = false, _logA1Vide = false;

function _store() {
  try { return getThrottleStore(); }
  catch (e) {
    if (!_logStoreIndispo) { console.error('throttle : store Blobs indisponible (NETLIFY_SITE_ID / NETLIFY_BLOBS_TOKEN ?) — throttle INACTIF, fail-open'); _logStoreIndispo = true; }
    return null;
  }
}
const _key = (pol, axe, val) => pol.prefixe + ':' + axe.cle + ':' + val;
const _cooldownProg = (axe, c) => (c <= axe.libres ? 0 : Math.min(axe.capS, axe.base * Math.pow(2, c - axe.libres - 1)));
const _val = (axe, v) => (axe.cle === 'm' ? normMail(v) : v); // le mail est normalisé ; l'id non

// Vérifie un axe → secondes d'attente (0 = libre).
async function _verifAxe(store, pol, axe, v, now) {
  const val = _val(axe, v);
  if (val === '' || val == null) return 0;
  const key = _key(pol, axe, val);
  if (axe.type === 'dur') {
    const u = _lockDur.get(key);
    if (u && u > now) return Math.ceil((u - now) / 1000);
    if (u) _lockDur.delete(key);
    try {
      const e = await store.get(key, { type: 'json' });
      if (e && e.until && e.until > now) { _lockDur.set(key, e.until); return Math.ceil((e.until - now) / 1000); }
    } catch (e) { console.error('throttle read [' + key + '] : ' + (e && e.message || '')); }
    return 0;
  }
  try {
    const e = await store.get(key, { type: 'json' });
    if (e && e.last && (now - e.last) < axe.windowMs) {
      const reste = _cooldownProg(axe, e.c || 0) * 1000 - (now - e.last);
      if (reste > 0) return Math.ceil(reste / 1000);
    }
  } catch (e) { console.error('throttle read [' + key + '] : ' + (e && e.message || '')); }
  return 0;
}

async function _echecAxe(store, pol, axe, v, now) {
  const val = _val(axe, v);
  if (val === '' || val == null) return;
  const key = _key(pol, axe, val);
  try {
    let e = await store.get(key, { type: 'json' }).catch(() => null);
    if (axe.type === 'dur') {
      if (!e || (now - (e.t || 0)) > axe.windowMs) e = { c: 0, t: now };
      e.c++;
      if (e.c >= axe.seuil) { e.until = now + axe.lockMs; _lockDur.set(key, e.until); }
    } else {
      if (!e || (now - (e.last || 0)) > axe.windowMs) e = { c: 0, last: now };
      e.c++; e.last = now;
    }
    await store.setJSON(key, e);
  } catch (e) { console.error('throttle write [' + key + '] : ' + (e && e.message || '')); }
}

// a1 = IP ; a2 = valeur de l'axe secondaire (mail côté client, id de membre côté équipe).
async function verifierThrottle(a1, a2, police) {
  const pol = police || POLICE_CLIENT;
  const now = Date.now();
  if (!a1 && !_logA1Vide) { console.error('throttle : en-tête IP client vide (x-nf-client-connection-ip absent) — axe IP INACTIF'); _logA1Vide = true; }
  const store = _store();
  if (!store) return { bloque: false }; // fail-open
  if (a1) { const r = await _verifAxe(store, pol, pol.ip, a1, now); if (r > 0) return { bloque: true, retryAfter: r }; }
  const r2 = await _verifAxe(store, pol, pol.sec, a2, now);
  if (r2 > 0) return { bloque: true, retryAfter: r2 };
  return { bloque: false };
}

// Sur un ÉCHEC d'identifiants : incrémente l'axe IP et l'axe secondaire.
async function enregistrerEchec(a1, a2, police) {
  const pol = police || POLICE_CLIENT;
  const now = Date.now();
  const store = _store();
  if (!store) return;
  if (a1) await _echecAxe(store, pol, pol.ip, a1, now);
  await _echecAxe(store, pol, pol.sec, a2, now);
}

// Sur un SUCCÈS : efface le compteur de l'axe secondaire (mail / id). IP laissée. Best-effort.
async function enregistrerSucces(a1, a2, police) {
  const pol = police || POLICE_CLIENT;
  const store = _store();
  if (!store) return;
  const val = _val(pol.sec, a2);
  if (val) { try { await store.delete(_key(pol, pol.sec, val)); } catch (e) { /* best-effort */ } }
}

module.exports = { verifierThrottle, enregistrerEchec, enregistrerSucces, POLICE_EQUIPE };
