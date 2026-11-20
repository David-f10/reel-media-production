'use strict';
// Banc — orientation du cadre vidéo (serveur). montage-client 'lire' renvoie une orientation DÉRIVÉE de Sous-format.
// Prouve : (a) Sous-format = YouTube → 'paysage' ; (b) tout autre sous-format ET sous-format VIDE → 'portrait' ;
//          (d) ⛔ la chaîne « Sous-format » (champ éditorial brut) n'apparaît NULLE PART dans la réponse.

process.env.CLIENT_SIGN_SECRET = 'banc-secret-orient';
process.env.NOTION_TOKEN = 'banc-notion-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';
process.env.NETLIFY_SITE_ID = 'banc-site';
process.env.NETLIFY_BLOBS_TOKEN = 'banc-blobs-token';

const _Module = require('module'); const _origLoad = _Module._load;
_Module._load = function (request) {
  if (request === 'googleapis') return { google: {} };
  if (request === '@netlify/blobs') return { getStore: () => ({ setJSON: async () => {}, set: async () => {}, get: async () => null, delete: async () => {}, list: async () => ({ blobs: [] }) }) };
  return _origLoad.apply(this, arguments);
};

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const CID = '11111111-1111-1111-1111-111111111111';

const CONTACT = { id: CID, properties: { 'Mail': { email: 'c@x.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const VERSION = { id: 'versionpage', properties: { 'Sujet ID': { rich_text: [{ plain_text: 'sujet-B33D' }] }, 'Date envoi client': { date: { start: '2025-01-01' } }, 'Titre': { title: [{ plain_text: 'film.mp4' }] }, 'Version': { rich_text: [{ plain_text: 'V1' }] } } };

let SOUSFORMAT = '';   // configuré par test ; '' = vide (doit donner portrait)
const SENTINELLE = 'SOUS-FORMAT-NE-DOIT-PAS-SORTIR'; // si jamais le champ brut transitait sous une forme inattendue
const sujet = () => ({ id: 'sujet-B33D', properties: {
  'Code': { rich_text: [{ plain_text: 'B33D' }] },
  'Format': { select: { name: 'Brand' } },
  'Titre': { title: [{ plain_text: 'Sujet ' + SENTINELLE }] }, // la sentinelle est AILLEURS (titre) — jamais le Sous-format
  'Visible espace client': { checkbox: true },
  'Sous-format': SOUSFORMAT ? { select: { name: SOUSFORMAT } } : { select: null } } });

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    if (db === DB_VERSIONS) return rep({ results: [VERSION] });
    if (db === DB_PROD) return rep({ results: [sujet()] }); // projetsDeMarque ET re-lecture par Code → le même sujet
    return rep({ results: [] });
  }
  return rep({});
};

const montage = require('../netlify/functions/montage-client').handler;
const { signer } = require('../netlify/functions/_clienttoken');
const evt = (jeton) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify({ action: 'lire', sujetCode: 'B33D' }) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const orientationDe = async () => { const r = await montage(evt(signer(CID).token)); return { body: r.body, o: JSON.parse(r.body || '{}').orientation }; };

(async () => {
  console.log('\n\x1b[1mOrientation dérivée de Sous-format\x1b[0m');
  SOUSFORMAT = 'YouTube'; let r = await orientationDe();
  ok('(a) Sous-format = YouTube → orientation \'paysage\'', r.o === 'paysage');
  ok('(d) ⛔ la chaîne « Sous-format » n\'apparaît pas dans la réponse', r.body.indexOf('Sous-format') === -1);
  ok('(d) ⛔ et la valeur du sous-format non plus (seule l\'orientation dérivée sort)', r.body.indexOf('YouTube') === -1);

  SOUSFORMAT = 'Décli'; r = await orientationDe();
  ok('(b) autre sous-format (Décli) → \'portrait\'', r.o === 'portrait');
  ok('(d) ⛔ « Décli » n\'apparaît pas dans la réponse', r.body.indexOf('Décli') === -1);

  SOUSFORMAT = ''; r = await orientationDe();
  ok('(b) sous-format VIDE → \'portrait\' (défaut)', r.o === 'portrait');

  SOUSFORMAT = 'Mag'; r = await orientationDe();
  ok('(b) encore un autre (Mag) → \'portrait\'', r.o === 'portrait');
  ok('(d) ⛔ jamais « Sous-format » dans aucune réponse', r.body.indexOf('Sous-format') === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
