'use strict';
// Banc — PR-2 : la route « changer son code » (code-client.js). Réseau Notion + store Blobs mockés.
// Prouve : succès (PATCH du nouveau code) ; ancien code faux → 401 SANS PATCH ; ro → 403 ; longueur < 8 → 400 ;
// tout-identique → 400 ; ⛔ AUCUN targetId (l'id vient du jeton, un targetId du corps est ignoré) ; sans jeton
// → 401 ; ⛔ aucune valeur de code (ancien NI nouveau) dans AUCUNE réponse ; et le PREMIER banc de throttle
// du dépôt : après des ancien-codes faux répétés → 429.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

// Store Blobs mocké (map mémoire, réinitialisable) → throttle RÉEL (pas fail-open).
const mem = new Map();
const store = { get: async (k) => { const v = mem.get(k); return v === undefined ? null : v; }, setJSON: async (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); }, delete: async (k) => { mem.delete(k); } };
const _blobsPath = require.resolve('../netlify/functions/_blobs');
require.cache[_blobsPath] = { id: _blobsPath, filename: _blobsPath, loaded: true, exports: { getThrottleStore: () => store } };

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const CID = '11111111-1111-1111-1111-111111111111';
const OLD = 'ANCIEN-SENTINELLE-9';   // Code acces actuel (sentinelle : ne doit sortir d'AUCUNE réponse)
const NEW = 'NOUVEAUCODE12';         // nouveau code (≥8, pas tout-identique)
const CONTACT = { id: CID, parent: { database_id: 'dbcontacts' }, properties: { 'Mail': { rich_text: [{ plain_text: 'c@refashion.fr' }] }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Code acces': { rich_text: [{ plain_text: OLD }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };

let patches = [];
const rep = (obj, status) => Promise.resolve({ ok: !(status >= 400), status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) { const db = mq[1]; if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] }); if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT] }); return rep({ results: [] }); }
  const mp = u.match(/\/pages\/([0-9a-fA-F-]+)$/);
  if (mp) {
    if (method === 'PATCH') { patches.push({ id: mp[1], props: (opt && opt.body ? JSON.parse(opt.body).properties : {}) }); return rep({ id: mp[1] }); }
    return mp[1] === CID ? rep(CONTACT) : rep({ object: 'error' }, 404);
  }
  return rep({});
};

const { signer } = require('../netlify/functions/_clienttoken');
const codeClient = require('../netlify/functions/code-client').handler;
const IP = '203.0.113.7';
const evt = (jeton, b, ip) => ({ httpMethod: 'POST', headers: Object.assign({ 'x-nf-client-connection-ip': ip || IP }, jeton ? { 'x-rmc-token': jeton } : {}), body: JSON.stringify(b || {}) });
const TOK = signer(CID).token, TOK_RO = signer(CID, { ro: true, acteur: '44444444-4444-4444-4444-444444444444' }).token;

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const reponses = [];
async function appel(jeton, b, ip) { mem.clear(); patches = []; const r = await codeClient(evt(jeton, b, ip)); reponses.push(r.body || ''); return { code: r.statusCode, d: JSON.parse(r.body || '{}'), raw: r.body || '' }; }

(async () => {
  console.log('\n\x1b[1mchanger son code — succès et gardes\x1b[0m');
  let r = await appel(TOK, { oldCode: OLD, newCode: NEW });
  ok('ancien correct + nouveau valide → 200', r.code === 200 && r.d.ok);
  ok('le PATCH écrit le NOUVEAU code sur la fiche du JETON', patches.length === 1 && patches[0].id === CID && (patches[0].props['Code acces'].rich_text[0].text.content === NEW));
  ok('⛔ réponse NUE : ni ancien ni nouveau code', r.raw.indexOf(OLD) === -1 && r.raw.indexOf(NEW) === -1);

  r = await appel(TOK, { oldCode: 'FAUX', newCode: NEW });
  ok('ancien code FAUX → 401, AUCUN PATCH', r.code === 401 && patches.length === 0);

  r = await appel(TOK_RO, { oldCode: OLD, newCode: NEW });
  ok('emprunt chef (ro) → 403, AUCUN PATCH', r.code === 403 && patches.length === 0);

  r = await appel(TOK, { oldCode: OLD, newCode: 'ABC' });
  ok('nouveau code < 8 → 400, AUCUN PATCH', r.code === 400 && patches.length === 0);

  r = await appel(TOK, { oldCode: OLD, newCode: 'aaaaaaaa' });
  ok('nouveau code tout-identique → 400, AUCUN PATCH', r.code === 400 && patches.length === 0);

  console.log('\n\x1b[1m⛔ aucun targetId : seul l\'id du JETON peut changer\x1b[0m');
  r = await appel(TOK, { oldCode: OLD, newCode: NEW, targetId: '99999999-9999-9999-9999-999999999999' });
  ok('un targetId dans le corps est IGNORÉ → le PATCH vise l\'id du jeton', r.code === 200 && patches.length === 1 && patches[0].id === CID);

  r = await appel('', { oldCode: OLD, newCode: NEW });
  ok('sans jeton → 401', r.code === 401);

  console.log('\n\x1b[1mthrottle (PREMIER banc du dépôt) — ancien code faux répété\x1b[0m');
  mem.clear(); patches = [];
  const ipT = '203.0.113.99';
  let codes = [];
  for (let i = 0; i < 4; i++) { const rr = await codeClient(evt(TOK, { oldCode: 'FAUX', newCode: NEW }, ipT)); codes.push(rr.statusCode); reponses.push(rr.body || ''); }
  ok('les 3 premiers ancien-codes faux → 401', codes[0] === 401 && codes[1] === 401 && codes[2] === 401);
  ok('le 4e est BLOQUÉ par le throttle → 429', codes[3] === 429);

  console.log('\n\x1b[1mSentinelle globale\x1b[0m');
  ok('⛔ la valeur de l\'ancien code n\'apparaît dans AUCUNE réponse', reponses.every(b => b.indexOf(OLD) === -1));
  ok('⛔ la valeur du nouveau code n\'apparaît dans AUCUNE réponse', reponses.every(b => b.indexOf(NEW) === -1));

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
