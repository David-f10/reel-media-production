'use strict';
// Banc — la réponse de login est PROPRE après le retrait de « code court ». Réseau mocké.
// Prouve : verifyClient n'émet plus codeCourt ; login-client ne renvoie plus codeCourt (⛔ pas de charge morte) ;
// codeBrand reste (consommé par l'écran VOLONTAIRE « Changer mon code ») ; un login à 3 car. réussit sans
// codeCourt ; le jeton reste { id, exp } ; ⛔ aucune valeur de code ne sort.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const CODE_COURT = 'ABC';
const C = { id: '11111111-1111-1111-1111-111111111111', properties: { 'Mail': { rich_text: [{ plain_text: 'c@refashion.fr' }] }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Code acces': { rich_text: [{ plain_text: CODE_COURT }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url) {
  const u = String(url), mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) { const db = mq[1]; if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] }); if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [C] }); return rep({ results: [] }); }
  return rep({});
};

// _blobs tire @netlify/blobs (absent en test) : mock → throttle FAIL-OPEN.
const _blobsPath = require.resolve('../netlify/functions/_blobs');
require.cache[_blobsPath] = { id: _blobsPath, filename: _blobsPath, loaded: true, exports: { getThrottleStore: () => { throw new Error('banc: pas de store'); } } };

const { verifyClient } = require('../netlify/functions/_authclient');
const loginClient = require('../netlify/functions/login-client').handler;
const evt = (b) => ({ httpMethod: 'POST', headers: {}, body: JSON.stringify(b) });
const b64uDec = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mverifyClient — plus de codeCourt\x1b[0m');
  const v = await verifyClient({ mail: 'c@refashion.fr', code: CODE_COURT });
  ok('login OK même avec un code court (3 car.)', v.ok === true);
  ok('⛔ le contact ne porte PLUS codeCourt', !('codeCourt' in v.contact));
  ok('codeBrand reste (pour l\'écran volontaire)', v.contact.codeBrand === 'B33');

  console.log('\n\x1b[1mlogin-client — réponse propre\x1b[0m');
  const r = await loginClient(evt({ mail: 'c@refashion.fr', code: CODE_COURT }));
  const b = JSON.parse(r.body || '{}');
  ok('200 + token + codeBrand', r.statusCode === 200 && b.ok && !!b.token && b.codeBrand === 'B33');
  ok('⛔ la réponse ne porte PLUS codeCourt', !('codeCourt' in b));
  const charge = JSON.parse(b64uDec(String(b.token).split('.')[0]));
  ok('⛔ jeton = { id, exp } seulement', Object.keys(charge).sort().join(',') === 'exp,id');
  ok('⛔ aucune valeur de code dans la réponse', r.body.indexOf(CODE_COURT) === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
