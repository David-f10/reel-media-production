'use strict';
// Banc — PR-1 (lot 2) : le SOCLE SERVEUR du fil de conversation. Réseau mocké.
// Prouve, côté demande-client (5 actions bornées AU CONTACT) ET demandes-admin (double-écriture + garde clôture) :
//  · ⛔ un contact ne peut NI lire NI écrire le fil d'un autre (bornage Contact client == vt.id, pas « même marque ») ;
//  · 'fil' : message initial préfixé (option iii), repli « Réponse » héritée SSI aucune ligne « Réel Média » ;
//  · 'message' : Sens='Client' estampillé SERVEUR (le corps client est ignoré) ;
//  · 'modifier' : les 5 gardes, une par scénario (dont (1)=(4), le même fait) ;
//  · 'clore'/'rouvrir' : transitions bornées ;
//  · demandes-admin : écrit UNE ligne 💬 Messages (Auteur générique « Réel Média », PAS le nom du membre) ET garde
//    « Réponse » ; REFUSE la rétrogradation Clôturée→Nouvelle (clôture client préservée) ; accepte Clôturée ;
//  · ⛔ zéro « Code acces », ⛔ zéro contenu de collègue dans TOUTES les réponses.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';
delete process.env.SLACK_WEBHOOK_URL; // signalerSlack = no-op silencieux

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const DB_MESSAGES = '41975d81-5951-81c7-b7f1-c2f2203ccd77';
const CODE_SENT = 'ZZSECRET-CODE-9';        // « Code acces » — ne doit JAMAIS sortir
const COLLEGUE_SENT = 'CONTENU-COLLEGUE-X';  // message d'un collègue — ne doit JAMAIS sortir

const CONTACT = '11111111-1111-1111-1111-111111111111';
const AUTRE = '99999999-9999-9999-9999-999999999999';
const CHEF_ID = '44444444-4444-4444-4444-444444444444', CHEF_CODE = 'CHEFCODE';

// Demandes (format GET /pages ET résultat de query : propriétés en plain_text).
const DEM1 = 'aaaa1111-1111-1111-1111-111111111111';     // contact, Nouvelle, fil vide
const DEM_CLOS = 'aaaa2222-2222-2222-2222-222222222222'; // contact, Clôturée
const DEM_AUTRE = 'bbbb3333-3333-3333-3333-333333333333'; // COLLÈGUE (Contact = AUTRE)
const DEM_REP = 'cccc4444-4444-4444-4444-444444444444';  // contact, Réponse héritée, 0 ligne fil → repli ON
const DEM_REP2 = 'dddd5555-5555-5555-5555-555555555555'; // contact, Réponse ancienne MAIS 1 ligne « Réel Média » → repli OFF
const DEM_MOD = 'eeee6666-6666-6666-6666-666666666666';  // contact, dernier message = client → modifier OK

function demPage(id, contact, statut, msg, reponse, lastEdited) {
  return {
    id, parent: { type: 'database_id', database_id: DB_DEMANDES },
    created_time: '2026-02-01T09:00:00Z', last_edited_time: lastEdited || '2026-02-10T09:00:00Z',
    properties: {
      'Message': { title: [{ plain_text: msg }] },
      'Statut': { select: { name: statut } },
      'Code Brand': { rich_text: [{ plain_text: 'B33' }] },
      'Contact client': { rich_text: [{ plain_text: contact }] },
      'Réponse': { rich_text: reponse ? [{ plain_text: reponse }] : [] },
      'Code acces': { rich_text: [{ plain_text: CODE_SENT }] } // sentinelle
    }
  };
}
const STORE = {
  [DEM1]: demPage(DEM1, CONTACT, 'Nouvelle', 'Ma demande initiale', ''),
  [DEM_CLOS]: demPage(DEM_CLOS, CONTACT, 'Clôturée', 'Demande close', ''),
  [DEM_AUTRE]: demPage(DEM_AUTRE, AUTRE, 'Nouvelle', COLLEGUE_SENT, COLLEGUE_SENT),
  [DEM_REP]: demPage(DEM_REP, CONTACT, 'Traitée', 'Demande répondue', 'REPONSE-HERITEE-OK', '2026-02-12T11:00:00Z'),
  [DEM_REP2]: demPage(DEM_REP2, CONTACT, 'Traitée', 'Demande répondue 2', 'ANCIENNE-REPONSE-NE-DOIT-PAS-SORTIR'),
  [DEM_MOD]: demPage(DEM_MOD, CONTACT, 'En cours', 'Demande à éditer', '')
};
// Fils 💬 Messages, par Réf demande.
const msgRow = (id, sens, texte) => ({ id, created_time: '2026-03-01T10:00:00Z', properties: {
  'Message': { title: [{ plain_text: texte }] }, 'Réf demande': { rich_text: [{ plain_text: '' }] },
  'Sens': { select: { name: sens } }, 'Auteur': { rich_text: [{ plain_text: sens === 'Réel Média' ? 'Réel Média' : 'Claire' }] },
  'Modifié le': { date: null } } });
const MSG_MOD = '1a1a0001-0000-0000-0000-00000000000a'; // id de message (hex, comme un vrai id Notion)
const FIL = {
  [DEM_MOD]: [msgRow(MSG_MOD, 'Client', 'mon dernier message')],
  [DEM_REP2]: [msgRow('2b2b0002-0000-0000-0000-00000000000b', 'Réel Média', 'vraie réponse équipe')]
};

const CONTACT_ROW = { id: CONTACT, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const CHEF = { id: CHEF_ID, properties: { 'Nom': { title: [{ plain_text: 'Chloé' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_CODE }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les clients': { checkbox: true } } };

// Capture des écritures.
let patches = [];   // { id, props }
let msgPosts = [];  // propriétés des POST vers DB_MESSAGES
const allBodies = []; // toutes les réponses renvoyées (contrôle fuite global)

const rep = (obj, status) => Promise.resolve({ ok: !(status >= 400), status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method || 'GET').toUpperCase();
  const body = opt && opt.body ? JSON.parse(opt.body) : {};
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT_ROW] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    if (db === DB_EQUIPE) return rep({ results: [CHEF] });
    if (db === DB_MESSAGES) { const eq = (((body.filter || {}).rich_text) || {}).equals; return rep({ results: FIL[eq] || [] }); }
    if (db === DB_DEMANDES) { const f = body.filter || {}; if (f.property === 'Contact client') return rep({ results: [STORE[DEM1]] }); return rep({ results: [STORE[DEM1]] }); }
    return rep({ results: [] });
  }
  const mp = u.match(/\/pages\/([0-9a-fA-F-]+)$/);
  if (mp) {
    const id = mp[1];
    if (method === 'PATCH') { patches.push({ id, props: body.properties || {} }); return rep({ id }); }
    const page = STORE[id];
    if (!page) return rep({ object: 'error', status: 404 }, 404); // introuvable → creerNotionFetch jette '… 404'
    return rep(page);
  }
  if (/\/pages$/.test(u) && method === 'POST') {
    if (body.parent && body.parent.database_id === DB_MESSAGES) msgPosts.push(body.properties || {});
    return rep({ id: 'cree' });
  }
  return rep({});
};

const demandeClient = require('../netlify/functions/demande-client').handler;
const demandesAdmin = require('../netlify/functions/demandes-admin').handler;
const { signer } = require('../netlify/functions/_clienttoken');
const TOK = signer(CONTACT).token;
const TOK_RO = signer(CONTACT, { ro: true, acteur: CHEF_ID }).token;
const evtC = (jeton, b) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(b) });
const evtT = (b) => ({ httpMethod: 'POST', headers: { 'x-rm-id': CHEF_ID, 'x-rm-code': CHEF_CODE }, body: JSON.stringify(b) });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
async function call(h, evt) { const r = await h(evt); allBodies.push(r.body || ''); return { code: r.statusCode, d: JSON.parse(r.body || '{}'), raw: r.body || '' }; }
const _rtv = (props, k) => ((props[k] && props[k].rich_text) || []).map(t => (t.text && t.text.content) || '').join('');
const _selv = (props, k) => (props[k] && props[k].select && props[k].select.name) || '';

(async () => {
  console.log('\n\x1b[1mBornage AU CONTACT — le fil d\'un collègue est hors de portée\x1b[0m');
  for (const act of ['fil', 'message', 'modifier', 'clore', 'rouvrir']) {
    const r = await call(demandeClient, evtC(TOK, { action: act, demandeId: DEM_AUTRE, texte: 'x' }));
    ok('⛔ ' + act + ' sur la demande d\'un collègue → 403', r.code === 403);
  }
  let r = await call(demandeClient, evtC(TOK, { action: 'fil', demandeId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }));
  ok('fil sur un id inexistant → 404', r.code === 404);
  r = await call(demandeClient, evtC(TOK, { action: 'fil', demandeId: 'pas-un-id' }));
  ok('fil sur un id malformé → 404 (jamais de réseau)', r.code === 404);

  console.log('\n\x1b[1mfil — message initial + repli « Réponse » héritée\x1b[0m');
  r = await call(demandeClient, evtC(TOK, { action: 'fil', demandeId: DEM1 }));
  ok('fil DEM1 → 200, le message INITIAL est préfixé (sens Client, « Vous »)', r.code === 200 && r.d.fil[0].initial === true && r.d.fil[0].auteur === 'Vous' && r.d.fil[0].texte === 'Ma demande initiale');
  ok('fil DEM1 → en attente (dernier message = client, pas clos)', r.d.delai.enAttente === true);
  r = await call(demandeClient, evtC(TOK, { action: 'fil', demandeId: DEM_REP }));
  const herite = (r.d.fil || []).filter(m => m.herite);
  ok('fil DEM_REP → repli ON : 1 message équipe hérité = « Réponse », auteur « Réel Média » générique', herite.length === 1 && herite[0].texte === 'REPONSE-HERITEE-OK' && herite[0].auteur === 'Réel Média');
  ok('fil DEM_REP → le repli est bien classé en dernier et marqué hérité', r.d.fil[r.d.fil.length - 1].herite === true);
  r = await call(demandeClient, evtC(TOK, { action: 'fil', demandeId: DEM_REP2 }));
  ok('fil DEM_REP2 → repli OFF : une ligne « Réel Média » existe, « Réponse » ancienne IGNORÉE', r.raw.indexOf('ANCIENNE-REPONSE') === -1 && r.d.fil.filter(m => m.herite).length === 0);
  ok('fil DEM_REP2 → la vraie réponse équipe est là (auteur « Réel Média », pas de nom de membre)', r.d.fil.some(m => m.sens === 'Réel Média' && m.auteur === 'Réel Média' && m.texte === 'vraie réponse équipe'));

  console.log('\n\x1b[1mmessage — Sens estampillé SERVEUR\x1b[0m');
  msgPosts = [];
  r = await call(demandeClient, evtC(TOK, { action: 'message', demandeId: DEM1, texte: 'coucou', Sens: 'Réel Média', sens: 'Réel Média' }));
  ok('message DEM1 → 200', r.code === 200);
  ok('ligne écrite : Sens = « Client » (le corps client est ignoré)', msgPosts.length === 1 && _selv(msgPosts[0], 'Sens') === 'Client');
  ok('ligne écrite : Réf demande = id COMPLET de la demande', _rtv(msgPosts[0], 'Réf demande') === DEM1);
  r = await call(demandeClient, evtC(TOK, { action: 'message', demandeId: DEM_CLOS, texte: 'coucou' }));
  ok('message sur demande Clôturée → 409 (rouvrir d\'abord)', r.code === 409);

  console.log('\n\x1b[1mmodifier — les 5 gardes (1 et 4 = le même fait)\x1b[0m');
  patches = [];
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM_MOD, texte: 'corrigé' }));
  ok('SUCCÈS : dernier message du client édité, « Modifié le » posé', r.code === 200 && patches.length === 1 && patches[0].id === MSG_MOD && !!patches[0].props['Modifié le']);
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM_REP2, texte: 'corrigé' }));
  ok('REFUS cond. 2/1/4 : dernier message = réponse équipe (réponse « en dessous ») → 409', r.code === 409);
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM_CLOS, texte: 'corrigé' }));
  ok('REFUS cond. 5 : demande Clôturée → 409', r.code === 409);
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM_AUTRE, texte: 'corrigé' }));
  ok('REFUS cond. 3 : demande d\'un autre contact → 403 (bornage)', r.code === 403);
  patches = [];
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM1, texte: 'ré-écrit' }));
  ok('fil vide → c\'est le message INITIAL qu\'on édite (PATCH sur la demande)', r.code === 200 && patches.length === 1 && patches[0].id === DEM1 && !!patches[0].props['Message']);

  console.log('\n\x1b[1mclore / rouvrir\x1b[0m');
  patches = [];
  r = await call(demandeClient, evtC(TOK, { action: 'clore', demandeId: DEM1 }));
  ok('clore DEM1 → PATCH Statut = Clôturée', r.code === 200 && _selv(patches[0].props, 'Statut') === 'Clôturée');
  r = await call(demandeClient, evtC(TOK, { action: 'clore', demandeId: DEM_CLOS }));
  ok('clore une demande déjà close → 409', r.code === 409);
  patches = [];
  r = await call(demandeClient, evtC(TOK, { action: 'rouvrir', demandeId: DEM_CLOS }));
  ok('rouvrir DEM_CLOS → PATCH Statut = En cours', r.code === 200 && _selv(patches[0].props, 'Statut') === 'En cours');
  r = await call(demandeClient, evtC(TOK, { action: 'rouvrir', demandeId: DEM1 }));
  ok('rouvrir une demande non close → 409', r.code === 409);

  console.log('\n\x1b[1mlecture seule (emprunt ro) — lectures OK, écritures refusées\x1b[0m');
  r = await call(demandeClient, evtC(TOK_RO, { action: 'fil', demandeId: DEM1 }));
  ok('ro : fil (lecture) → 200', r.code === 200);
  for (const act of ['message', 'modifier', 'clore', 'rouvrir']) {
    r = await call(demandeClient, evtC(TOK_RO, { action: act, demandeId: DEM1, texte: 'x' }));
    ok('ro : ' + act + ' (écriture) → 403', r.code === 403);
  }

  console.log('\n\x1b[1mmes — émet l\'id (clé du fil)\x1b[0m');
  r = await call(demandeClient, evtC(TOK, { action: 'mes' }));
  ok('mes → chaque demande porte son id de page (handle du fil)', r.code === 200 && (r.d.demandes || [])[0] && r.d.demandes[0].id === DEM1);

  console.log('\n\x1b[1mdemandes-admin — double-écriture + garde anti-rétrogradation\x1b[0m');
  patches = []; msgPosts = [];
  r = await call(demandesAdmin, evtT({ action: 'statut', id: DEM1, statut: 'Traitée', reponse: 'Notre réponse' }));
  ok('réponse équipe → PATCH « Réponse » CONSERVÉE (résumé écran équipe)', r.code === 200 && _rtv(patches[0].props, 'Réponse') === 'Notre réponse');
  ok('réponse équipe → une ligne 💬 Messages écrite (Sens « Réel Média »)', msgPosts.length === 1 && _selv(msgPosts[0], 'Sens') === 'Réel Média');
  ok('⛔ Auteur de la ligne = « Réel Média » générique, JAMAIS le nom du membre (Chloé)', _rtv(msgPosts[0], 'Auteur') === 'Réel Média' && msgPosts[0].Auteur && JSON.stringify(msgPosts[0]).indexOf('Chloé') === -1);
  ok('ligne 💬 Messages : Réf demande = id COMPLET de la demande', _rtv(msgPosts[0], 'Réf demande') === DEM1);
  patches = []; msgPosts = [];
  r = await call(demandesAdmin, evtT({ action: 'statut', id: DEM_CLOS, statut: 'Nouvelle', reponse: 'réponse tardive' }));
  ok('GARDE : Clôturée + statut reçu « Nouvelle » → reste Clôturée (clôture client PRÉSERVÉE)', r.code === 200 && _selv(patches[0].props, 'Statut') === 'Clôturée');
  ok('GARDE : la réponse est tout de même enregistrée (pas perdue)', _rtv(patches[0].props, 'Réponse') === 'réponse tardive' && msgPosts.length === 1);
  patches = [];
  r = await call(demandesAdmin, evtT({ action: 'statut', id: DEM_CLOS, statut: 'Clôturée', reponse: '' }));
  ok('STATUTS accepte « Clôturée » (l\'équipe peut resoumettre sans 400)', r.code === 200 && _selv(patches[0].props, 'Statut') === 'Clôturée');
  patches = [];
  r = await call(demandesAdmin, evtT({ action: 'statut', id: DEM_CLOS, statut: 'En cours', reponse: '' }));
  ok('Clôturée → En cours AUTORISÉ (geste délibéré de l\'équipe, pas un défaut d\'onglet)', r.code === 200 && _selv(patches[0].props, 'Statut') === 'En cours');

  console.log('\n\x1b[1mDéfaut 1 — pas de doublon : ligne fil SSI le texte a changé\x1b[0m');
  msgPosts = [];
  r = await call(demandesAdmin, evtT({ action: 'statut', id: DEM_REP, statut: 'Traitée', reponse: 'REPONSE-HERITEE-OK' })); // MÊME texte que la « Réponse » actuelle (pré-remplie par index.html, renvoyée telle quelle)
  ok('même texte que la « Réponse » actuelle → AUCUNE ligne fil (anti-doublon)', r.code === 200 && msgPosts.length === 0);
  msgPosts = [];
  r = await call(demandesAdmin, evtT({ action: 'statut', id: DEM_REP, statut: 'Traitée', reponse: 'un texte RÉELLEMENT différent' }));
  ok('texte différent → UNE ligne fil', r.code === 200 && msgPosts.length === 1);

  console.log('\n\x1b[1mDéfaut 2 — pas d\'édition de la question sous une réponse héritée\x1b[0m');
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM_REP, texte: 'réécriture' })); // fil vide MAIS « Réponse » héritée affichée en dessous
  ok('modifier : fil vide mais « Réponse » héritée en dessous → 409 (pas d\'édition sous réponse)', r.code === 409);
  r = await call(demandeClient, evtC(TOK, { action: 'modifier', demandeId: DEM1, texte: 'ok sans réponse' })); // fil vide ET pas de Réponse → toujours autorisé
  ok('modifier : fil vide ET aucune réponse → l\'initial reste éditable (non-régression)', r.code === 200);

  console.log('\n\x1b[1mSentinelles globales\x1b[0m');
  ok('⛔ aucun « Code acces » dans AUCUNE réponse', allBodies.every(b => b.indexOf(CODE_SENT) === -1));
  ok('⛔ aucun contenu de collègue dans AUCUNE réponse', allBodies.every(b => b.indexOf(COLLEGUE_SENT) === -1));

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
