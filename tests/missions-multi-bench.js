'use strict';
// Banc — PR-A : Plateforme/Format image en MULTI_SELECT + Sous-format, côté mission-client ET missions-admin.
// Réseau mocké. Le mock REJETTE (400) tout POST qui porte « Plateforme.select » (type mismatch Notion) et
// n'accepte que « Plateforme.multi_select » : c'est la PREUVE du 503 — l'ancien code (un { select }) ferait 400
// → 503 → mission perdue ; le nouveau écrit multi_select → 200.
// Prouve :
//  · plateforme ["Instagram","TikTok"] → les DEUX arrivent (multi_select) et sont relues des deux côtés ;
//  · format image ["9:16","16:9"] idem ;
//  · coercition chaîne→tableau (ancien formulaire) ;
//  · hors-liste dans le tableau → 400, AUCUN POST ;
//  · Sous-format : Classic/Standard/Desk REFUSÉS à la création, mais une fiche qui en porte s'AFFICHE ;
//  · objet vide → 400 ; objet 2001 car. → 400 (refusé, pas tronqué) ;
//  · ⛔ zéro « Code acces ».

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const DB_MISSIONS = '41875d81-5951-81b6-a6aa-ff03bfbcfd49';
const SECRET = 'ZZSECRET-CODE-9';
const ID = '11111111-1111-1111-1111-111111111111';
const CHEF_ID = '44444444-4444-4444-4444-444444444444', CHEF_CODE = 'CHEFCODE';

const { signer } = require('../netlify/functions/_clienttoken');

const CONTACT = { id: ID, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Code acces': { rich_text: [{ plain_text: SECRET }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const CHEF = { id: CHEF_ID, properties: { 'Nom': { title: [{ plain_text: 'Chloé' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_CODE }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les clients': { checkbox: true } } };
// Une mission EXISTANTE : Plateforme multi (deux valeurs), Sous-format = « Classic » (RETIRÉ à la création mais
// porté par 50 fiches → doit s'afficher), sentinelle « Code acces ».
const MISSION = { id: '22222222-2222-2222-2222-222222222222', parent: { database_id: DB_MISSIONS }, created_time: '2026-03-01T09:00:00Z', properties: {
  'Objet': { title: [{ plain_text: 'Film ateliers' }] }, 'Statut': { select: { name: 'Nouvelle' } },
  'Plateforme': { multi_select: [{ name: 'Instagram' }, { name: 'TikTok' }] },
  'Format image': { multi_select: [{ name: '9:16' }] },
  'Sous-format': { select: { name: 'Classic' } },
  'Lieu de tournage': { rich_text: [{ plain_text: 'Lille' }] },
  'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Contact client': { rich_text: [{ plain_text: ID }] },
  'Demandeur': { rich_text: [{ plain_text: 'Claire' }] }, 'Réponse': { rich_text: [] }, 'Carte créée': { rich_text: [] },
  'Validé commercial par': { rich_text: [] }, 'Code acces': { rich_text: [{ plain_text: SECRET }] } } };

let posts = []; // corps des POST /pages (création)
const rep = (obj, status) => Promise.resolve({ ok: (status || 200) < 400, status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  const body = opt && opt.body ? JSON.parse(opt.body) : null;
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    if (db === DB_EQUIPE) return rep({ results: [CHEF] });
    if (db === DB_MISSIONS) return rep({ results: [MISSION] });
    return rep({ results: [] });
  }
  if (/\/pages$/.test(u) && method === 'POST') {
    posts.push(body);
    const pr = (body && body.properties) || {};
    // Notion : un { select } sur une propriété MULTI_SELECT = type mismatch → 400 (→ 503 appelant). C'est le bug.
    if (pr['Plateforme'] && 'select' in pr['Plateforme']) return rep({ object: 'error', message: 'validation_error' }, 400);
    if (pr['Format image'] && 'select' in pr['Format image']) return rep({ object: 'error', message: 'validation_error' }, 400);
    return rep({ id: 'created' });
  }
  return rep({});
};

const missionClient = require('../netlify/functions/mission-client').handler;
const missionsAdmin = require('../netlify/functions/missions-admin').handler;
const evtC = (body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': signer(ID).token }, body: JSON.stringify(body) });
const evtT = (body) => ({ httpMethod: 'POST', headers: { 'x-rm-id': CHEF_ID, 'x-rm-code': CHEF_CODE }, body: JSON.stringify(body) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const noms = (ms) => (ms || []).map(o => o.name);

(async () => {
  console.log('\n\x1b[1mcreer — Plateforme/Format en MULTI_SELECT (preuve du 503)\x1b[0m');
  posts = [];
  let r = await missionClient(evtC({ action: 'creer', objet: 'Film', plateforme: ['Instagram', 'TikTok'], formatImage: ['9:16', '16:9'], sousFormat: 'Face Cam' }));
  ok('creer multi → 200 (le mock refuse tout { select } : donc on a écrit multi_select)', r.statusCode === 200);
  const p = posts[posts.length - 1].properties;
  ok('POST : Plateforme.multi_select porte LES DEUX (Instagram + TikTok)', p['Plateforme'] && noms(p['Plateforme'].multi_select).join(',') === 'Instagram,TikTok');
  ok('POST : Format image.multi_select porte 9:16 + 16:9', p['Format image'] && noms(p['Format image'].multi_select).join(',') === '9:16,16:9');
  ok('POST : Sous-format en { select } « Face Cam »', p['Sous-format'] && p['Sous-format'].select.name === 'Face Cam');
  ok('POST : ⛔ Plateforme n\'est JAMAIS un { select }', !('select' in p['Plateforme']));

  console.log('\n\x1b[1mcoercition chaîne→tableau (ancien formulaire)\x1b[0m');
  posts = [];
  r = await missionClient(evtC({ action: 'creer', objet: 'Film', plateforme: 'Interne' }));
  ok('creer avec plateforme CHAÎNE « Interne » → 200', r.statusCode === 200);
  ok('POST : écrite en multi_select [Interne]', noms(posts[posts.length - 1].properties['Plateforme'].multi_select).join(',') === 'Interne');

  console.log('\n\x1b[1mhors-liste → 400, rien écrit\x1b[0m');
  posts = [];
  r = await missionClient(evtC({ action: 'creer', objet: 'Film', plateforme: ['Instagram', 'LinkedIn'] }));
  ok('plateforme avec une valeur hors liste → 400', r.statusCode === 400);
  ok('⛔ AUCUN POST /pages (rien écrit)', posts.length === 0);
  r = await missionClient(evtC({ action: 'creer', objet: 'Film', formatImage: ['4:3'] }));
  ok('format image hors liste → 400', r.statusCode === 400);

  console.log('\n\x1b[1mSous-format : retiré à la création, mais affiché\x1b[0m');
  for (const sf of ['Classic', 'Standard', 'Desk']) {
    r = await missionClient(evtC({ action: 'creer', objet: 'Film', sousFormat: sf }));
    ok('Sous-format « ' + sf + ' » REFUSÉ à la création → 400', r.statusCode === 400);
  }
  r = await missionClient(evtC({ action: 'mes' }));
  let mb = JSON.parse(r.body || '{}');
  ok('mes : la fiche qui PORTE « Classic » l\'AFFICHE quand même (lecture non filtrée)', mb.missions[0].sousFormat === 'Classic');
  ok('mes : plateforme relue en TABLEAU (Instagram + TikTok)', (mb.missions[0].plateforme || []).join(',') === 'Instagram,TikTok');
  ok('mes : formatImage + lieu exposés', (mb.missions[0].formatImage || []).join(',') === '9:16' && mb.missions[0].lieu === 'Lille');

  console.log('\n\x1b[1mmissions-admin : relit le multi_select des deux côtés\x1b[0m');
  r = await missionsAdmin(evtT({ action: 'liste' }));
  const lb = JSON.parse(r.body || '{}');
  ok('liste → 200', r.statusCode === 200 && lb.ok);
  ok('liste : plateforme en TABLEAU (Instagram + TikTok), MÊME lecture que le client', (lb.missions[0].plateforme || []).join(',') === 'Instagram,TikTok');
  ok('liste : formatImage + sousFormat renvoyés au payload (pour le dashboard)', (lb.missions[0].formatImage || []).join(',') === '9:16' && lb.missions[0].sousFormat === 'Classic');

  console.log('\n\x1b[1mobjet : vide → 400 ; 2001 car. → 400 (refusé)\x1b[0m');
  r = await missionClient(evtC({ action: 'creer', objet: '' }));
  ok('objet vide → 400', r.statusCode === 400);
  r = await missionClient(evtC({ action: 'creer', objet: 'a'.repeat(2001) }));
  ok('objet 2001 caractères → 400 (REFUSÉ, pas tronqué)', r.statusCode === 400);

  console.log('\n\x1b[1mSentinelles\x1b[0m');
  ok('⛔ aucune valeur de code (mes)', (await missionClient(evtC({ action: 'mes' }))).body.indexOf(SECRET) === -1);
  ok('⛔ aucune mention « Code acces » (liste)', (await missionsAdmin(evtT({ action: 'liste' }))).body.indexOf('Code acces') === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
