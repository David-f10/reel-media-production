'use strict';
// Banc — étage 2a : mission-client (proposer un nouveau film + mes missions). Réseau mocké.
// Prouve : estampille serveur (Origine 'Espace client', Statut 'Nouvelle', Code Brand / Demandeur / Contact
// client), un SEUL champ obligatoire (Objet), tolérance du « je ne sais pas encore » (tout le reste facultatif
// passe), validation de forme des champs fournis (Plateforme select fermé 5 valeurs dont « Interne », date
// « Pour quand »), refus d'écriture sous emprunt ro, et ⛔ ZÉRO « Code acces »/valeur de code dans les réponses
// (une sentinelle est injectée dans les lignes simulées pour le prouver).

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_MISSIONS = '41875d81-5951-81b6-a6aa-ff03bfbcfd49';
const SECRET = 'ZZSECRET-CODE-9'; // ne doit JAMAIS apparaître dans une réponse

const ID = '11111111-1111-1111-1111-111111111111'; // contact client (B33)

const { signer } = require('../netlify/functions/_clienttoken');

const CONTACT = { id: ID, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Code acces': { rich_text: [{ plain_text: SECRET }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
// Une mission simulée AVEC une sentinelle « Code acces » (que le vrai schéma n'a pas) : prouve que la fonction ne la renvoie jamais.
const MISSION = { id: '22222222-2222-2222-2222-222222222222', parent: { database_id: DB_MISSIONS }, created_time: '2026-03-01T09:00:00Z', properties: {
  'Objet': { title: [{ plain_text: 'Un film sur nos ateliers' }] }, 'Statut': { select: { name: 'Nouvelle' } },
  'Plateforme': { select: { name: 'Interne' } }, 'Réponse': { rich_text: [] }, 'Carte créée': { rich_text: [] },
  'Pour quand': { date: { start: '2026-05-01' } }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] },
  'Contact client': { rich_text: [{ plain_text: ID }] }, 'Demandeur': { rich_text: [{ plain_text: 'Claire' }] },
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
    if (db === DB_MISSIONS) return rep({ results: [MISSION] });
    return rep({ results: [] });
  }
  if (/\/pages(\/|$)/.test(u)) return rep({ id: 'created' }); // POST create
  return rep({});
};

const missionClient = require('../netlify/functions/mission-client').handler;
const evtC = (jeton, body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(body) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const jNorm = signer(ID).token, jRo = signer(ID, { ro: true }).token;

(async () => {
  console.log('\n\x1b[1mmission-client — proposer un film\x1b[0m');
  let r = await missionClient(evtC(jNorm, { action: 'creer', objet: 'Un film sur nos ateliers' }));
  ok('creer avec le SEUL champ obligatoire (objet) → 200', r.statusCode === 200 && JSON.parse(r.body).ok);

  // Vérifie l'estampille serveur sur le POST de création (le dernier appel /pages).
  const poste = reseau.filter(x => /\/pages$/.test(x.u) && x.method === 'POST');
  ok('creer : au moins un POST /pages', poste.length >= 1);

  r = await missionClient(evtC(jNorm, { action: 'creer', objet: 'Film réseaux', plateforme: 'Interne', pourQuand: '2026-05-01', lieu: 'Nos ateliers, Lille', personnes: 'Le directeur', contactSurPlace: 'Marc 0601020304' }));
  ok('creer avec tous les champs (Plateforme « Interne », date, adresse…) → 200', r.statusCode === 200);

  r = await missionClient(evtC(jNorm, { action: 'creer', objet: 'x', plateforme: 'LinkedIn' }));
  ok('creer avec Plateforme hors du select fermé → 400', r.statusCode === 400);

  r = await missionClient(evtC(jNorm, { action: 'creer', objet: '' }));
  ok('creer sans objet (seul obligatoire) → 400', r.statusCode === 400);

  r = await missionClient(evtC(jNorm, { action: 'creer', objet: 'x', pourQuand: '01/05/2026' }));
  ok('creer avec date « pour quand » mal formée → 400', r.statusCode === 400);

  r = await missionClient(evtC(jNorm, { action: 'creer', objet: 'x', pourQuand: '2026-13-40' }));
  ok('creer avec date impossible (2026-13-40) → 400', r.statusCode === 400);

  r = await missionClient(evtC(jRo, { action: 'creer', objet: 'x' }));
  ok('creer sous emprunt ro → 403 (lecture seule)', r.statusCode === 403);

  console.log('\n\x1b[1mmission-client — mes missions\x1b[0m');
  r = await missionClient(evtC(jNorm, { action: 'mes' }));
  const mb = JSON.parse(r.body || '{}');
  ok('mes → 200 + liste', r.statusCode === 200 && mb.ok && (mb.missions || []).length === 1);
  ok('mes : objet + statut + plateforme + carte exposés', mb.missions[0].objet && mb.missions[0].statut === 'Nouvelle' && mb.missions[0].plateforme === 'Interne' && ('carteCreee' in mb.missions[0]));
  ok('mes : ⛔ aucune valeur de code', r.body.indexOf(SECRET) === -1);
  ok('mes : ⛔ aucune mention « Code acces »', r.body.indexOf('Code acces') === -1);

  console.log('\n\x1b[1mmission-client — action inconnue\x1b[0m');
  r = await missionClient(evtC(jNorm, { action: 'supprimer' }));
  ok('action inconnue → 400', r.statusCode === 400);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
