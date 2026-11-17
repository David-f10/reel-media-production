'use strict';
// Banc — « Qui a accès » (serveur) : accesClient + la route acces-client. Réseau mocké.
// Prouve : (a) cloisonnement — aucun contact d'une AUTRE marque ne sort ; (b) ⛔ aucune valeur NI longueur de
// code, seul le booléen aCode ; (c) les trois états, dont le cas « propriété Actif ABSENTE » (= actif).

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const CODE_SENT = 'ZZSECRET-CODE-9';        // valeur de Code acces — ⛔ ne doit JAMAIS sortir
const COLLEGUE_AUTRE = 'CONTACT-B50-SENT';  // contact d'une autre marque — ⛔ ne doit JAMAIS sortir

// B33 (la marque de l'appelant) : 4 cas d'états. B50 : une autre marque (cloisonnement).
const row = (id, nom, brand, actifProp, code) => { const pr = { 'Nom': { title: [{ plain_text: nom }] }, 'Mail': { rich_text: [{ plain_text: nom.toLowerCase() + '@x.fr' }] }, 'Code Brand': { rich_text: [{ plain_text: brand }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] }, 'Code acces': { rich_text: code ? [{ plain_text: code }] : [] } }; if (actifProp !== 'absent') pr['Actif'] = { checkbox: actifProp }; return { id, properties: pr }; };
const CID = '11111111-1111-1111-1111-111111111111';
const CONTACTS = [
  row(CID, 'Claire', 'B33', true, CODE_SENT),                              // actif + code → Actif
  row('22222222-2222-2222-2222-222222222222', 'Marc', 'B33', true, ''),    // actif + pas de code → En attente
  row('33333333-3333-3333-3333-333333333333', 'Sofia', 'B33', false, 'x'), // inactif → Sans accès
  row('44444444-4444-4444-4444-444444444444', 'Theo', 'B33', 'absent', 'y'),// Actif ABSENTE → actif (défaut)
  row('55555555-5555-5555-5555-555555555555', COLLEGUE_AUTRE, 'B50', true, 'zzz') // AUTRE marque
];
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url) {
  const u = String(url), mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) { const db = mq[1]; if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] }); if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: CONTACTS }); return rep({ results: [] }); }
  return rep({});
};

const { accesClient } = require('../netlify/functions/_authclient');
const accesHandler = require('../netlify/functions/acces-client').handler;
const { signer } = require('../netlify/functions/_clienttoken');
const evt = (jeton) => ({ httpMethod: 'POST', headers: jeton ? { 'x-rmc-token': jeton } : {}, body: '{}' });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const parMail = (acces) => { const o = {}; (acces || []).forEach(x => { o[x.nom] = x; }); return o; };

(async () => {
  console.log('\n\x1b[1maccesClient(codeBrand) — cloisonnement + états + aCode\x1b[0m');
  const r = await accesClient('B33');
  ok('→ ok + 4 personnes de B33 (jamais B50)', r.ok && r.acces.length === 4);
  ok('⛔ aucun contact d\'une autre marque (B50) dans la réponse', JSON.stringify(r).indexOf(COLLEGUE_AUTRE) === -1);
  ok('⛔ aucune valeur de code', JSON.stringify(r).indexOf(CODE_SENT) === -1);
  const g = parMail(r.acces);
  // LISTE BLANCHE : chaque personne porte EXACTEMENT ces 4 clés. Toute clé en plus (quel que soit son nom —
  // longueur, valeur, n'importe quoi) fait tomber le banc. Sur CHAQUE entrée, pas seulement la première.
  const CLES = ['nom', 'mail', 'actif', 'aCode'].sort().join(',');
  ok('CHAQUE personne porte EXACTEMENT {nom, mail, actif, aCode} — aucune clé en plus', r.acces.every(x => Object.keys(x).sort().join(',') === CLES));
  ok('aCode est un BOOLÉEN sur chaque personne', r.acces.every(x => typeof x.aCode === 'boolean'));
  ok('état Actif : actif + aCode true (Claire)', g.Claire.actif === true && g.Claire.aCode === true);
  ok('état En attente : actif + aCode false (Marc)', g.Marc.actif === true && g.Marc.aCode === false);
  ok('état Sans accès : inactif (Sofia)', g.Sofia.actif === false);
  ok('propriété Actif ABSENTE → actif true (Theo)', g.Theo.actif === true && g.Theo.aCode === true);

  console.log('\n\x1b[1mla route acces-client — bornée au jeton\x1b[0m');
  let res = await accesHandler(evt(signer(CID).token));
  let b = JSON.parse(res.body || '{}');
  ok('appelant B33 → 200 + 4 personnes de B33', res.statusCode === 200 && b.ok && (b.acces || []).length === 4);
  ok('⛔ aucun contact B50 dans la réponse de la route', res.body.indexOf(COLLEGUE_AUTRE) === -1);
  ok('⛔ aucune valeur de code dans la réponse de la route', res.body.indexOf(CODE_SENT) === -1);
  res = await accesHandler(evt(''));
  ok('sans jeton → 401', res.statusCode === 401);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
