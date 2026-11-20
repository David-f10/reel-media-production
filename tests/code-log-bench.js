'use strict';
// Banc — PR de suivi #258 : les catches de _authclient (et _auth/login) ne laissent PAS fuir un fragment de
// corps au journal. Même patron que #258 : une réponse 200 de la base dont .json() REJETTE avec une SyntaxError
// portant une sentinelle (comme Node 20+ sur un corps tronqué) → la sentinelle n'apparaît dans AUCUN console.error.
// Priorité à verifyClient : son try englobe _getContacts, qui parse TOUS les contacts et TOUS leurs codes.

process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const LEAK_SENT = 'FUITE-CONTACTS-SENTINELLE';
const _logs = []; console.error = function () { _logs.push(Array.prototype.join.call(arguments, ' ')); };

// Toute query renvoie un 200 dont .json() rejette avec un fragment portant la sentinelle (corps tronqué simulé).
global.fetch = function (url) {
  const u = String(url);
  if (/\/databases\/.+\/query$/.test(u)) {
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input near "[{\\"Code acces\\":\\"' + LEAK_SENT + '\\"}, …" is not valid JSON')), text: () => Promise.resolve('x') });
  }
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve({}), text: () => Promise.resolve('{}') });
};

const { verifyClient, contactActif, accesClient, adminClients } = require('../netlify/functions/_authclient');

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mverifyClient — corps contacts tronqué, aucune fuite au journal\x1b[0m');
  _logs.length = 0;
  let v = await verifyClient({ mail: 'x@refashion.fr', code: 'peu-importe' });
  ok('corps tronqué → { ok:false, raison:\'indispo\' } (pas de crash)', v && v.ok === false && v.raison === 'indispo');
  ok('un console.error a bien été émis', _logs.length > 0);
  ok('⛔ la sentinelle (fragment du corps) n\'apparaît dans AUCUN console.error', _logs.every(l => l.indexOf(LEAK_SENT) === -1));

  console.log('\n\x1b[1mcontactActif — même garantie\x1b[0m');
  _logs.length = 0;
  let c = await contactActif('11111111-1111-1111-1111-111111111111');
  ok('corps tronqué → indispo', c && c.ok === false && c.raison === 'indispo');
  ok('⛔ aucune sentinelle dans les console.error', _logs.length > 0 && _logs.every(l => l.indexOf(LEAK_SENT) === -1));

  console.log('\n\x1b[1maccesClient — même garantie (catch de « Qui a accès »)\x1b[0m');
  _logs.length = 0;
  let a = await accesClient('B33');
  ok('corps tronqué → indispo', a && a.ok === false && a.raison === 'indispo');
  ok('⛔ aucune sentinelle dans les console.error', _logs.length > 0 && _logs.every(l => l.indexOf(LEAK_SENT) === -1));

  console.log('\n\x1b[1madminClients(avecCodes) — même garantie (lot B : le chemin qui LIT les codes)\x1b[0m');
  _logs.length = 0;
  // avecCodes=true = le cas STRICT : même quand on DEMANDE les codes, un corps tronqué ne doit rien mettre au journal
  // (le try englobe _getContacts, qui parse TOUS les contacts ET leurs codes).
  let ac = await adminClients(true);
  ok('corps tronqué → indispo', ac && ac.ok === false && ac.raison === 'indispo');
  ok('⛔ aucune sentinelle dans les console.error', _logs.length > 0 && _logs.every(l => l.indexOf(LEAK_SENT) === -1));

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
