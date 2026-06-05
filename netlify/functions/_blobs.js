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

module.exports = { getPushStore };
