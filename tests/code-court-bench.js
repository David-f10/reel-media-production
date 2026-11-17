'use strict';
// Banc — PR-2 : le booléen « code court ». Réseau mocké.
// Prouve : verifyClient émet codeCourt (BOOLÉEN) selon la longueur ; login-client le met dans la RÉPONSE avec
// codeBrand ; ⛔ codeCourt n'est PAS dans la charge du jeton (signé-non-chiffré) ; ⛔ aucune valeur de code
// ni aucune longueur ne sort.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const CODE_COURT = 'ABC';            // 3 car. → codeCourt true
const CODE_LONG = 'ABCDEFGHIJ';      // 10 car. → codeCourt false
const C_COURT = { id: '11111111-1111-1111-1111-111111111111', properties: { 'Mail': { rich_text: [{ plain_text: 'court@refashion.fr' }] }, 'Nom': { title: [{ plain_text: 'Court' }] }, 'Code acces': { rich_text: [{ plain_text: CODE_COURT }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const C_LONG = { id: '22222222-2222-2222-2222-222222222222', properties: { 'Mail': { rich_text: [{ plain_text: 'long@refashion.fr' }] }, 'Nom': { title: [{ plain_text: 'Long' }] }, 'Code acces': { rich_text: [{ plain_text: CODE_LONG }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url) {
  const u = String(url), mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) { const db = mq[1]; if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] }); if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [C_COURT, C_LONG] }); return rep({ results: [] }); }
  return rep({});
};

// _blobs tire @netlify/blobs (absent en test) : on le mocke pour que _throttle tombe en FAIL-OPEN (pas de blocage).
const _blobsPath = require.resolve('../netlify/functions/_blobs');
require.cache[_blobsPath] = { id: _blobsPath, filename: _blobsPath, loaded: true, exports: { getThrottleStore: () => { throw new Error('banc: pas de store'); } } };

const { verifyClient } = require('../netlify/functions/_authclient');
const loginClient = require('../netlify/functions/login-client').handler;
const evt = (b) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify(b) });
const b64uDec = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mverifyClient — codeCourt booléen\x1b[0m');
  let v = await verifyClient({ mail: 'court@refashion.fr', code: CODE_COURT });
  ok('code court (3) → codeCourt true', v.ok && v.contact.codeCourt === true);
  ok('⛔ la réponse de verifyClient ne porte PAS la valeur du code', JSON.stringify(v).indexOf(CODE_COURT) === -1);
  v = await verifyClient({ mail: 'long@refashion.fr', code: CODE_LONG });
  ok('code long (10) → codeCourt false', v.ok && v.contact.codeCourt === false);

  console.log('\n\x1b[1mlogin-client — réponse (pas le jeton)\x1b[0m');
  let r = await loginClient(evt({ mail: 'court@refashion.fr', code: CODE_COURT }));
  let b = JSON.parse(r.body || '{}');
  ok('login code court → 200 + token + codeCourt true + codeBrand', r.statusCode === 200 && b.ok && !!b.token && b.codeCourt === true && b.codeBrand === 'B33');
  // ⛔ le booléen (et le code) ne sont PAS dans la charge signée du jeton
  const charge = JSON.parse(b64uDec(String(b.token).split('.')[0]));
  ok('⛔ charge du jeton = { id, exp } seulement (pas de codeCourt)', Object.keys(charge).sort().join(',') === 'exp,id');
  ok('⛔ charge du jeton ne contient ni « codeCourt » ni une valeur de code', JSON.stringify(charge).indexOf('codeCourt') === -1 && JSON.stringify(charge).indexOf(CODE_COURT) === -1);
  ok('⛔ aucune valeur de code dans la réponse de login', r.body.indexOf(CODE_COURT) === -1);

  r = await loginClient(evt({ mail: 'long@refashion.fr', code: CODE_LONG }));
  b = JSON.parse(r.body || '{}');
  ok('login code long → codeCourt false', r.statusCode === 200 && b.codeCourt === false);
  ok('⛔ aucune valeur de code dans la réponse de login (long)', r.body.indexOf(CODE_LONG) === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
