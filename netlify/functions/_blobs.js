// netlify/functions/_blobs.js
// Helper partagé : configuration explicite de Netlify Blobs.
// Certains contextes (preview deploy, certaines régions Functions) ne propagent pas
// automatiquement le siteID/token aux Functions ; on passe donc explicitement
// process.env.NETLIFY_SITE_ID + process.env.NETLIFY_BLOBS_TOKEN.
// Le préfixe '_' évite que ce fichier soit exposé comme function Netlify.

const { getStore } = require('@netlify/blobs');

function getPushStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error('Netlify Blobs non configuré : NETLIFY_SITE_ID et NETLIFY_BLOBS_TOKEN requis');
  }
  return getStore({ name: 'push-subs', siteID, token });
}

// Store des jetons éphémères d'auto-login (ouverture d'une vue lecteur depuis la PWA vers le navigateur).
// Clé = jeton aléatoire base64url ; valeur = { user, createdAt, expiresAt } ; usage unique strict.
function getAuthTokenStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error('Netlify Blobs non configuré : NETLIFY_SITE_ID et NETLIFY_BLOBS_TOKEN requis');
  }
  return getStore({ name: 'auth-tokens', siteID, token });
}

// Registre des permissions Drive "anyone" ouvertes pour le téléchargement direct.
// Clé = fileId ; valeur = { fileId, permissionId, openedAt } ; entrée retirée après
// révocation réussie. Le balayeur drive-permsweep révoque toute entrée trop ancienne.
function getDriveOpenPermsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error('Netlify Blobs non configuré : NETLIFY_SITE_ID et NETLIFY_BLOBS_TOKEN requis');
  }
  return getStore({ name: 'drive-open-perms', siteID, token });
}

// Throttle de connexion (espace client) : verrou FERME par IP, partagé entre instances.
// Clé = 'ip:<ip>' ; valeur = { c, t, until }. Lève si Blobs non configuré → le throttle fail-open.
function getThrottleStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error('Netlify Blobs non configuré : NETLIFY_SITE_ID et NETLIFY_BLOBS_TOKEN requis');
  }
  return getStore({ name: 'login-throttle', siteID, token });
}

// Garde-fou de consommation du relais vidéo (drive-stream). Clé = 'cid:<contact>:<yyyymmdd>' ; valeur =
// { octets }. Incrémenté de façon COARSE (une fois par palier de ~64 Mo, pas par tranche) pour ne pas peser
// sur la fluidité ; au-delà du plafond quotidien, le relais renvoie 429. Lève si Blobs non configuré → le
// relais fail-open sur le garde-fou (ne bloque pas la lecture pour une panne de compteur).
function getStreamBudgetStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    throw new Error('Netlify Blobs non configuré : NETLIFY_SITE_ID et NETLIFY_BLOBS_TOKEN requis');
  }
  return getStore({ name: 'stream-budget', siteID, token });
}

module.exports = { getPushStore, getAuthTokenStore, getDriveOpenPermsStore, getThrottleStore, getStreamBudgetStore };
