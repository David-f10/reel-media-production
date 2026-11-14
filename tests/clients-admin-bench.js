'use strict';
// Banc — écran d'admin clients (lot 3, LECTURE SEULE). Prouve, sans réseau :
//   • gardé par le droit CLIENT « Peut gérer les clients » (la clé ÉQUIPE seule ne suffit pas) ;
//   • la liste (marques + comptage actifs + séries + Nb projets) et la fiche (interlocuteurs) ;
//   • ⛔ AUCUN « Code acces » ni aucune valeur de code dans la réponse — le point non négociable.

process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const SECRET = 'ZZSECRET-CODE-9';   // valeur de code ; NE DOIT JAMAIS apparaître dans une réponse

const CHEF = { id: 'chef-client', properties: { 'Nom': { title: [{ plain_text: 'Chef' }] }, 'Code acces': { rich_text: [{ plain_text: 'CHEFCODE1' }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les clients': { checkbox: true } } };
const CHEF_NO = { id: 'chef-equipe', properties: { 'Nom': { title: [{ plain_text: 'Équipe' }] }, 'Code acces': { rich_text: [{ plain_text: 'EQUIPECODE' }] }, 'Peut gérer les accès': { checkbox: true } } }; // clé ÉQUIPE mais PAS le droit client
const BRAND1 = { properties: { 'Client': { title: [{ plain_text: 'Refashion' }] }, 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true }, 'Séries accordées': { number: null }, 'Nb projets': { number: 14 } } };
const BRAND2 = { properties: { 'Client': { title: [{ plain_text: 'AXA' }] }, 'Code': { rich_text: [{ plain_text: 'B08' }] }, 'Espace client activé': { checkbox: false }, 'Nb projets': { number: 31 } } }; // fermée, sans séries
const CONTACT1 = { id: 'c1', properties: { 'Nom': { title: [{ plain_text: 'Claire Besson' }] }, 'Mail': { email: 'claire@refashion.fr' }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Actif': { checkbox: true }, 'Code acces': { rich_text: [{ plain_text: SECRET }] } } };
const CONTACT2 = { id: 'c2', properties: { 'Nom': { title: [{ plain_text: 'Marc Oliveira' }] }, 'Mail': { email: 'marc@refashion.fr' }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Actif': { checkbox: false }, 'Code acces': { rich_text: [{ plain_text: SECRET }] } } };

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url) {
  const u = String(url), mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === DB_EQUIPE) return rep({ results: [CHEF, CHEF_NO] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND1, BRAND2] });
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT1, CONTACT2] });
  }
  return rep({ results: [] });
};

const { handler } = require('../netlify/functions/clients-admin');
const evt = (id, code, body) => ({ httpMethod: 'POST', headers: { 'x-rm-id': id, 'x-rm-code': code }, body: JSON.stringify(body) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mAdmin clients — garde du droit CLIENT\x1b[0m');
  const refus = await handler(evt('chef-equipe', 'EQUIPECODE', { action: 'liste' }));
  ok('clé ÉQUIPE sans droit client → 403', refus.statusCode === 403);
  const anon = await handler(evt('inconnu', 'xxx', { action: 'liste' }));
  ok('identifiants inconnus → 403', anon.statusCode === 403);

  console.log('\n\x1b[1mListe des marques\x1b[0m');
  const L = await handler(evt('chef-client', 'CHEFCODE1', { action: 'liste' }));
  const lb = JSON.parse(L.body || '{}');
  ok('porteur du droit client → 200', L.statusCode === 200 && lb.ok);
  const b33 = (lb.marques || []).find(m => m.code === 'B33');
  const b08 = (lb.marques || []).find(m => m.code === 'B08');
  ok('B33 : nom + ouverte', b33 && b33.nom === 'Refashion' && b33.ouverte === true);
  ok('B33 : 1 interlocuteur actif (Marc désactivé non compté)', b33 && b33.nbActifs === 1);
  ok('B33 : séries null (→ « 5 par défaut » à l\'écran)', b33 && b33.series === null);
  ok('B33 : nbProjets 14', b33 && b33.nbProjets === 14);
  ok('B08 : fermée', b08 && b08.ouverte === false);

  console.log('\n\x1b[1mFiche marque\x1b[0m');
  const F = await handler(evt('chef-client', 'CHEFCODE1', { action: 'fiche', codeBrand: 'B33' }));
  const fb = JSON.parse(F.body || '{}');
  ok('fiche B33 → 200', F.statusCode === 200 && fb.ok);
  ok('2 interlocuteurs (nom, mail, actif)', (fb.interlocuteurs || []).length === 2);
  const claire = (fb.interlocuteurs || []).find(c => c.nom === 'Claire Besson');
  ok('Claire : actif + mail présent', claire && claire.actif === true && claire.mail === 'claire@refashion.fr');
  ok('fiche marque inconnue → 404', (await handler(evt('chef-client', 'CHEFCODE1', { action: 'fiche', codeBrand: 'B99' }))).statusCode === 404);

  console.log('\n\x1b[1m⛔ Aucun code d\'accès dans les réponses\x1b[0m');
  ok('liste : aucune valeur de code', L.body.indexOf(SECRET) === -1);
  ok('liste : aucune mention « Code acces »', L.body.indexOf('Code acces') === -1);
  ok('fiche : aucune valeur de code', F.body.indexOf(SECRET) === -1);
  ok('fiche : aucune mention « Code acces »', F.body.indexOf('Code acces') === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
