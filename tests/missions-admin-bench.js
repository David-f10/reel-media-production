'use strict';
// Banc — étage 2b : missions-admin (file équipe du triage commercial). Réseau mocké.
// Prouve : garde du droit CLIENT (les 8), VERBE de décision (pas de statut brut) borné Nouvelle → Acceptée|
// Refusée, refus EXIGE un motif, bornage du PATCH à la base Missions (id forgé → 403), transition interdite si
// déjà traitée (409), estampille « Validé commercial par » serveur, et ⛔ ZÉRO « Code acces »/valeur de code
// (sentinelle injectée dans les lignes simulées).

process.env.NOTION_TOKEN = 'banc-token';

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const DB_MISSIONS = '41875d81-5951-81b6-a6aa-ff03bfbcfd49';
const SECRET = 'ZZSECRET-CODE-9'; // ne doit JAMAIS apparaître dans une réponse

const MIS_ID = '22222222-2222-2222-2222-222222222222';     // mission à Nouvelle (traitable)
const TRAITEE_ID = '66666666-6666-6666-6666-666666666666'; // mission déjà Acceptée (plus traitable)
const AUTRE_ID = '33333333-3333-3333-3333-333333333333';   // page HORS base Missions (forgée)
const CHEF_ID = '44444444-4444-4444-4444-444444444444', CHEF_CODE = 'CHEFCODE';
const CHEF_NO_ID = '55555555-5555-5555-5555-555555555555', CHEF_NO_CODE = 'NOCODE';

const CHEF = { id: CHEF_ID, properties: { 'Nom': { title: [{ plain_text: 'Chloé' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_CODE }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les clients': { checkbox: true } } };
const CHEF_NO = { id: CHEF_NO_ID, properties: { 'Nom': { title: [{ plain_text: 'Simple' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_NO_CODE }] }, 'Role': { select: { name: 'Monteur' } } } };
// Mission AVEC une sentinelle « Code acces » (que le vrai schéma n'a pas) : prouve que la fonction ne la renvoie jamais.
const mission = (id, statut) => ({ id, parent: { database_id: DB_MISSIONS }, created_time: '2026-03-01T09:00:00Z', properties: {
  'Objet': { title: [{ plain_text: 'Un film sur nos ateliers' }] }, 'Statut': { select: { name: statut } },
  'Plateforme': { select: { name: 'Interne' } }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] },
  'Demandeur': { rich_text: [{ plain_text: 'Claire' }] }, 'Lieu de tournage': { rich_text: [{ plain_text: 'Nos ateliers, Lille' }] },
  'Réponse': { rich_text: [] }, 'Carte créée': { rich_text: [] }, 'Validé commercial par': { rich_text: [] },
  'Code acces': { rich_text: [{ plain_text: SECRET }] } } });

let reseau = [];
const rep = (obj, status) => Promise.resolve({ ok: (status || 200) < 400, status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  reseau.push({ u, method, body: opt && opt.body });
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === DB_EQUIPE) return rep({ results: [CHEF, CHEF_NO] });
    if (db === DB_MISSIONS) return rep({ results: [mission(MIS_ID, 'Nouvelle'), mission(TRAITEE_ID, 'Acceptée')] });
    return rep({ results: [] });
  }
  if (method === 'GET' && /\/pages\//.test(u)) {
    const bare = (s) => u.indexOf(s.replace(/-/g, '')) >= 0 || u.indexOf(s) >= 0;
    if (bare(AUTRE_ID)) return rep({ id: AUTRE_ID, parent: { database_id: 'une-autre-base' }, properties: {} });
    if (bare(TRAITEE_ID)) return rep(mission(TRAITEE_ID, 'Acceptée'));
    return rep(mission(MIS_ID, 'Nouvelle'));
  }
  if (/\/pages(\/|$)/.test(u)) return rep({ id: 'ok' }); // PATCH
  return rep({});
};

const missionsAdmin = require('../netlify/functions/missions-admin').handler;
const evtT = (id, code, body) => ({ httpMethod: 'POST', headers: { 'x-rm-id': id, 'x-rm-code': code }, body: JSON.stringify(body) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mmissions-admin — file\x1b[0m');
  let r = await missionsAdmin(evtT(CHEF_NO_ID, CHEF_NO_CODE, { action: 'liste' }));
  ok('sans le droit « Peut gérer les clients » → 403', r.statusCode === 403);
  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'liste' }));
  const lb = JSON.parse(r.body || '{}');
  ok('porteur du droit → 200 + liste', r.statusCode === 200 && lb.ok && (lb.missions || []).length === 2);
  ok('liste : tri Nouvelle d\'abord', lb.missions[0].statut === 'Nouvelle');
  ok('liste : ⛔ aucune valeur de code', r.body.indexOf(SECRET) === -1);
  ok('liste : ⛔ aucune mention « Code acces »', r.body.indexOf('Code acces') === -1);

  console.log('\n\x1b[1mmissions-admin — décision\x1b[0m');
  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'decision', id: MIS_ID, decision: 'accepter' }));
  ok('accepter une Nouvelle → 200', r.statusCode === 200 && JSON.parse(r.body).ok);
  // L'acceptation écrit Statut 'Acceptée' + Validé commercial par, et RIEN d'autre (pas de Réponse).
  const pAcc = reseau.filter(x => x.method === 'PATCH').slice(-1)[0];
  ok('accepter : PATCH Statut=Acceptée + Validé commercial par (serveur), sans Réponse',
    pAcc && pAcc.body.indexOf('Acceptée') >= 0 && pAcc.body.indexOf('Validé commercial par') >= 0 && pAcc.body.indexOf('Chloé') >= 0 && pAcc.body.indexOf('Réponse') === -1);

  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'decision', id: MIS_ID, decision: 'refuser' }));
  ok('refuser SANS motif → 400 (un refus sans motif n\'a pas de sens)', r.statusCode === 400);
  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'decision', id: MIS_ID, decision: 'refuser', motif: 'Hors ligne éditoriale.' }));
  ok('refuser AVEC motif → 200', r.statusCode === 200 && JSON.parse(r.body).ok);
  const pRef = reseau.filter(x => x.method === 'PATCH').slice(-1)[0];
  ok('refuser : PATCH Statut=Refusée + Réponse=motif', pRef && pRef.body.indexOf('Refusée') >= 0 && pRef.body.indexOf('Hors ligne') >= 0);

  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'decision', id: MIS_ID, decision: 'valider' }));
  ok('verbe hors {accepter,refuser} → 400', r.statusCode === 400);
  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'decision', id: AUTRE_ID, decision: 'accepter' }));
  ok('décision sur un id HORS base Missions (forgé) → 403 (bornage)', r.statusCode === 403);
  r = await missionsAdmin(evtT(CHEF_ID, CHEF_CODE, { action: 'decision', id: TRAITEE_ID, decision: 'accepter' }));
  ok('décision sur une mission DÉJÀ traitée (Acceptée) → 409', r.statusCode === 409);
  r = await missionsAdmin(evtT(CHEF_NO_ID, CHEF_NO_CODE, { action: 'decision', id: MIS_ID, decision: 'accepter' }));
  ok('décision sans le droit → 403', r.statusCode === 403);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
