'use strict';
// Banc — circuit court (lot A) : demande-client (dépôt + mes) et demandes-admin (file équipe + statut).
// Prouve, réseau mocké : estampille serveur, validation de périmètre du Code carte, refus sous emprunt ro,
// garde du droit CLIENT côté équipe, bornage du PATCH à la base Demandes, et ⛔ ZÉRO « Code acces »/valeur de
// code dans les réponses (une sentinelle est injectée dans les lignes simulées pour le prouver).

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const SECRET = 'ZZSECRET-CODE-9'; // ne doit JAMAIS apparaître dans une réponse

const ID = '11111111-1111-1111-1111-111111111111';     // contact client (B33)
const DEM_ID = '22222222-2222-2222-2222-222222222222';  // une demande existante
const AUTRE_ID = '33333333-3333-3333-3333-333333333333'; // une page HORS base Demandes (forgée)
const CHEF_ID = '44444444-4444-4444-4444-444444444444', CHEF_CODE = 'CHEFCODE';
const CHEF_NO_ID = '55555555-5555-5555-5555-555555555555', CHEF_NO_CODE = 'NOCODE';

const { signer, verifier } = require('../netlify/functions/_clienttoken');

const CONTACT = { id: ID, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Code acces': { rich_text: [{ plain_text: SECRET }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const CHEF = { id: CHEF_ID, properties: { 'Nom': { title: [{ plain_text: 'Chef' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_CODE }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les clients': { checkbox: true } } };
const CHEF_NO = { id: CHEF_NO_ID, properties: { 'Nom': { title: [{ plain_text: 'Simple' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_NO_CODE }] }, 'Role': { select: { name: 'Monteur' } } } };
// Une demande simulée AVEC une sentinelle « Code acces » (que le vrai schéma n'a pas) : prouve que les fonctions ne la renvoient jamais.
const DEMANDE = { id: DEM_ID, parent: { database_id: DB_DEMANDES }, created_time: '2026-02-01T10:00:00Z', properties: {
  'Message': { title: [{ plain_text: 'Peut-on décaler le tournage ?' }] }, 'Type': { select: { name: 'Décaler un tournage' } },
  'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Code carte': { rich_text: [{ plain_text: 'B33D' }] },
  'Demandeur': { rich_text: [{ plain_text: 'Claire' }] }, 'Contact client': { rich_text: [{ plain_text: ID }] },
  'Statut': { select: { name: 'Nouvelle' } }, 'Réponse': { rich_text: [] }, 'Traité par': { rich_text: [] },
  'Code acces': { rich_text: [{ plain_text: SECRET }] } } };

let reseau = [];
const rep = (obj, status) => Promise.resolve({ ok: (status || 200) < 400, status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  reseau.push({ u, method });
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    if (db === DB_EQUIPE) return rep({ results: [CHEF, CHEF_NO] });
    if (db === DB_DEMANDES) return rep({ results: [DEMANDE] });
    return rep({ results: [] });
  }
  if (method === 'GET' && /\/pages\//.test(u)) {
    if (u.indexOf(AUTRE_ID.replace(/-/g, '')) >= 0 || u.indexOf(AUTRE_ID) >= 0) return rep({ id: AUTRE_ID, parent: { database_id: 'une-autre-base' }, properties: {} });
    return rep(DEMANDE); // par défaut, une page de la base Demandes
  }
  if (/\/pages(\/|$)/.test(u)) return rep({ id: 'created' }); // POST create / PATCH
  return rep({});
};

const demandeClient = require('../netlify/functions/demande-client').handler;
const demandesAdmin = require('../netlify/functions/demandes-admin').handler;
const evtC = (jeton, body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(body) });
const evtT = (id, code, body) => ({ httpMethod: 'POST', headers: { 'x-rm-id': id, 'x-rm-code': code }, body: JSON.stringify(body) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const jNorm = signer(ID).token, jRo = signer(ID, { ro: true }).token;

(async () => {
  console.log('\n\x1b[1mdemande-client — dépôt\x1b[0m');
  let r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Décaler un tournage', message: 'On décale ?', codeCarte: 'B33D' }));
  ok('creer (type valide, carte dans le périmètre) → 200', r.statusCode === 200 && JSON.parse(r.body).ok);
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: 'Une question' }));
  ok('creer (Autre, sans carte) → 200', r.statusCode === 200);
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Nouveau film', message: 'x' }));
  ok('creer type hors du select fermé (« Nouveau film ») → 400', r.statusCode === 400);
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: '' }));
  ok('creer message vide → 400', r.statusCode === 400);
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: 'x', codeCarte: 'B99Z' }));
  ok('creer carte HORS périmètre marque → 400', r.statusCode === 400);
  r = await demandeClient(evtC(jRo, { action: 'creer', type: 'Autre', message: 'x' }));
  ok('creer sous emprunt ro → 403 (lecture seule)', r.statusCode === 403);

  console.log('\n\x1b[1mdemande-client — mes demandes\x1b[0m');
  r = await demandeClient(evtC(jNorm, { action: 'mes' }));
  const mb = JSON.parse(r.body || '{}');
  ok('mes → 200 + liste', r.statusCode === 200 && mb.ok && (mb.demandes || []).length === 1);
  ok('mes : message + statut + réponse exposés', mb.demandes[0].message && mb.demandes[0].statut === 'Nouvelle');
  ok('mes : ⛔ aucune valeur de code', r.body.indexOf(SECRET) === -1);

  console.log('\n\x1b[1mdemandes-admin — file équipe\x1b[0m');
  r = await demandesAdmin(evtT(CHEF_NO_ID, CHEF_NO_CODE, { action: 'liste' }));
  ok('sans le droit « Peut gérer les clients » → 403', r.statusCode === 403);
  r = await demandesAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'liste' }));
  const lb = JSON.parse(r.body || '{}');
  ok('porteur du droit → 200 + liste', r.statusCode === 200 && lb.ok && (lb.demandes || []).length === 1);
  ok('liste : ⛔ aucune valeur de code', r.body.indexOf(SECRET) === -1);
  ok('liste : ⛔ aucune mention « Code acces »', r.body.indexOf('Code acces') === -1);

  console.log('\n\x1b[1mdemandes-admin — changement de statut\x1b[0m');
  r = await demandesAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'statut', id: DEM_ID, statut: 'Traitée', reponse: 'C\'est décalé.' }));
  ok('statut (valide, id dans la base) → 200', r.statusCode === 200 && JSON.parse(r.body).ok);
  r = await demandesAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'statut', id: DEM_ID, statut: 'Pas un statut' }));
  ok('statut hors du select fermé → 400', r.statusCode === 400);
  r = await demandesAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'statut', id: AUTRE_ID, statut: 'Traitée' }));
  ok('statut sur un id HORS base Demandes (forgé) → 403 (bornage)', r.statusCode === 403);
  r = await demandesAdmin(evtT(CHEF_NO_ID, CHEF_NO_CODE, { action: 'statut', id: DEM_ID, statut: 'Traitée' }));
  ok('statut sans le droit → 403', r.statusCode === 403);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
