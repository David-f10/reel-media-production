'use strict';
// Banc — PR-B : numérotation « D-<Code Brand>-<NN> » dérivée À LA LECTURE. Réseau mocké.
// Prouve :
//  · le RANG est celui de la MARQUE (pas du contact) : des demandes de collègues avec un id ANTÉRIEUR
//    poussent le rang du contact (ses demandes ne sont pas forcément 01, 02 — elles peuvent être 02, 04) ;
//  · l'AFFICHAGE reste filtré sur le contact → ⛔ aucun contenu de collègue ne sort (sentinelle) ;
//  · demandes-admin 'liste' donne le MÊME « D-<marque>-<NN> » pour une demande donnée (cohérence) ;
//  · groupement par marque (B33 et B50 numérotés séparément) ;
//  · ⛔ zéro « Code acces ».

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const CODE_SENT = 'ZZSECRET-CODE-9';       // ne doit jamais sortir (Code acces)
const COLLEGUE_SENT = 'CONTENU-COLLEGUE-X'; // ne doit jamais sortir (message d'un collègue)

const CONTACT = '11111111-1111-1111-1111-111111111111'; // le contact connecté (B33)
const AUTRE = '99999999-9999-9999-9999-999999999999';   // un collègue de B33
const CHEF_ID = '44444444-4444-4444-4444-444444444444', CHEF_CODE = 'CHEFCODE';

const { signer } = require('../netlify/functions/_clienttoken');

// Lignes B33 par id CROISSANT : A(collègue) < B(contact) < C(collègue) < D(contact) → rangs 1,2,3,4.
const row = (id, msg, brand, contact) => ({ id, created_time: '2026-02-01T10:00:00Z', properties: {
  'Message': { title: [{ plain_text: msg }] }, 'Type': { select: { name: 'Autre' } }, 'Statut': { select: { name: 'Nouvelle' } },
  'Code Brand': { rich_text: [{ plain_text: brand }] }, 'Contact client': { rich_text: [{ plain_text: contact }] },
  'Réponse': { rich_text: [] }, 'Traité par': { rich_text: [] }, 'Code carte': { rich_text: [] },
  'Code acces': { rich_text: [{ plain_text: CODE_SENT }] } } });

const A = row('aaaaaaaa-0000-0000-0000-000000000001', COLLEGUE_SENT, 'B33', AUTRE);   // rang 1
const B = row('aaaaaaaa-0000-0000-0000-000000000002', 'Ma demande B', 'B33', CONTACT); // rang 2 → D-B33-02
const C = row('aaaaaaaa-0000-0000-0000-000000000003', COLLEGUE_SENT, 'B33', AUTRE);   // rang 3
const D = row('aaaaaaaa-0000-0000-0000-000000000004', 'Ma demande D', 'B33', CONTACT); // rang 4 → D-B33-04
// F : une ANCIENNE demande du contact, Code Brand GELÉ à B50 (sa marque d'alors), alors que le contact est
// maintenant B33. Le filtre d'affichage (Contact client) la garde ; elle est numérotée sous B50, pas perdue.
const F = row('bbbbbbbb-0000-0000-0000-000000000006', 'Ancienne demande B50', 'B50', CONTACT); // → D-B50-01

const CONTACT_ROW = { id: CONTACT, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const CHEF = { id: CHEF_ID, properties: { 'Nom': { title: [{ plain_text: 'Chloé' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_CODE }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les clients': { checkbox: true } } };

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT_ROW] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    if (db === DB_EQUIPE) return rep({ results: [CHEF] });
    if (db === DB_DEMANDES) {
      const f = body.filter || {};
      if (f.property === 'Contact client') return rep({ results: [B, D, F] });         // affichage : le contact (B33 ET B50 gelée)
      if (f.property === 'Code Brand') return rep({ results: f.rich_text.equals === 'B33' ? [A, B, C, D] : [F] }); // classement marque
      return rep({ results: [A, B, C, D, F] });                                          // admin 'liste' : toute la base
    }
    return rep({ results: [] });
  }
  return rep({});
};

const demandeClient = require('../netlify/functions/demande-client').handler;
const demandesAdmin = require('../netlify/functions/demandes-admin').handler;
const evtC = (jeton, b) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(b) });
const evtT = (id, code, b) => ({ httpMethod: 'POST', headers: { 'x-rm-id': id, 'x-rm-code': code }, body: JSON.stringify(b) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mdemande-client — numéro dérivé par marque\x1b[0m');
  let r = await demandeClient(evtC(signer(CONTACT).token, { action: 'mes' }));
  const mb = JSON.parse(r.body || '{}');
  ok('mes → 200 + les 3 demandes du contact (pas celles des collègues)', r.statusCode === 200 && mb.ok && (mb.demandes || []).length === 3);
  const parMsg = {}; (mb.demandes || []).forEach(x => { parMsg[x.message] = x.ref; });
  ok('rang DE LA MARQUE : « Ma demande B » = D-B33-02 (un collègue la précède)', parMsg['Ma demande B'] === 'D-B33-02');
  ok('rang DE LA MARQUE : « Ma demande D » = D-B33-04', parMsg['Ma demande D'] === 'D-B33-04');
  ok('Code Brand GELÉ : l\'ancienne demande B50 RESTE visible (pas perdue), numérotée D-B50-01', parMsg['Ancienne demande B50'] === 'D-B50-01');
  ok('⛔ aucun contenu de collègue dans la réponse', r.body.indexOf(COLLEGUE_SENT) === -1);
  ok('⛔ aucune valeur de code', r.body.indexOf(CODE_SENT) === -1);

  console.log('\n\x1b[1mdemandes-admin — même numéro, groupé par marque\x1b[0m');
  r = await demandesAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'liste' }));
  const lb = JSON.parse(r.body || '{}');
  const ref = {}; (lb.demandes || []).forEach(x => { ref[x.message] = x.ref; });
  ok('liste → 200 + 5 demandes', r.statusCode === 200 && lb.ok && (lb.demandes || []).length === 5);
  ok('B33 numérotée par id croissant : B=02, D=04 (comme chez le client)', ref['Ma demande B'] === 'D-B33-02' && ref['Ma demande D'] === 'D-B33-04');
  ok('marque SÉPARÉE : B50 recommence à 01', ref['Ancienne demande B50'] === 'D-B50-01');
  ok('COHÉRENCE : « Ma demande B » a la même réf des deux côtés', ref['Ma demande B'] === parMsg['Ma demande B'] && ref['Ancienne demande B50'] === parMsg['Ancienne demande B50']);
  ok('⛔ aucune mention « Code acces »', r.body.indexOf('Code acces') === -1 && r.body.indexOf(CODE_SENT) === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
