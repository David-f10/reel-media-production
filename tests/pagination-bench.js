'use strict';
// Banc — PR-2 : la pagination de demande-client action 'mes'. Réseau mocké, DEUX pages.
// Prouve : la boucle SUIT le curseur (2ᵉ requête avec start_cursor), fusionne les pages (2 demandes rendues),
// et ⛔ ne renvoie jamais de valeur de code (sentinelle injectée). Avant ce PR, page_size 50 sans curseur
// avalait tout au-delà d'une page.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const SECRET = 'ZZSECRET-CODE-9'; // ne doit JAMAIS apparaître dans une réponse
const ID = '11111111-1111-1111-1111-111111111111';

const { signer } = require('../netlify/functions/_clienttoken');

const CONTACT = { id: ID, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Code acces': { rich_text: [{ plain_text: SECRET }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const demande = (msg) => ({ id: 'd-' + msg, created_time: '2026-02-01T10:00:00Z', properties: {
  'Message': { title: [{ plain_text: msg }] }, 'Type': { select: { name: 'Autre' } }, 'Statut': { select: { name: 'Nouvelle' } },
  'Réponse': { rich_text: [] }, 'Code carte': { rich_text: [] }, 'Code acces': { rich_text: [{ plain_text: SECRET }] } } });

let demQueries = []; // { start_cursor, page_size }
const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url);
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    if (db === DB_DEMANDES) {
      const corps = opt && opt.body ? JSON.parse(opt.body) : {};
      demQueries.push({ start_cursor: corps.start_cursor, page_size: corps.page_size });
      if (!corps.start_cursor) return rep({ results: [demande('page1')], has_more: true, next_cursor: 'cursor2' });
      return rep({ results: [demande('page2')], has_more: false });
    }
    return rep({ results: [] });
  }
  return rep({});
};

const demandeClient = require('../netlify/functions/demande-client').handler;
const evtC = (jeton, body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(body) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const jNorm = signer(ID).token;

(async () => {
  console.log('\n\x1b[1mdemande-client — pagination de « mes »\x1b[0m');
  const r = await demandeClient(evtC(jNorm, { action: 'mes' }));
  const b = JSON.parse(r.body || '{}');
  ok('mes → 200', r.statusCode === 200 && b.ok);
  ok('les DEUX pages sont fusionnées (2 demandes)', (b.demandes || []).length === 2);
  ok('deux requêtes Notion émises', demQueries.length === 2);
  ok('la 1re requête n\'a pas de curseur, page_size 100', demQueries[0] && !demQueries[0].start_cursor && demQueries[0].page_size === 100);
  ok('la 2e requête SUIT le curseur (start_cursor = next_cursor)', demQueries[1] && demQueries[1].start_cursor === 'cursor2');
  ok('⛔ aucune valeur de code dans la réponse', r.body.indexOf(SECRET) === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
