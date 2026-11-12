'use strict';
// Banc — emprunt chef « lecture seule » (lot 1, la GARDE serveur). Prouve, sans navigateur :
//   1. le jeton : un marqueur ro signé, infalsifiable, absent d'un vrai jeton client ;
//   2. le point de passage unique _notionio.appelNotion : sous ro, les SIX formes d'écriture (POST /pages,
//      PATCH /pages/<id>) sont refusées AVANT le réseau ; les lectures (GET, POST .../query) passent ;
//   3. les trois fonctions d'écriture : un jeton ro → 403 sur CHACUNE des six écritures réelles, et le
//      recorder réseau montre que RIEN de mutant n'a atteint /pages ; un jeton ro → 200 sur « lire » ;
//      un jeton NORMAL → l'écriture est bien tentée (la garde est propre au ro, pas un blocage aveugle).
// La « lecture seule » ne vit jamais dans le navigateur : elle est prouvée ici, côté serveur.

// ── Environnement (avant tout require de fonction) ──────────────────────────────────────────────────────
process.env.CLIENT_SIGN_SECRET = 'banc-secret-emprunt';
process.env.NOTION_TOKEN = 'banc-notion-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';
process.env.NETLIFY_SITE_ID = 'banc-site';
process.env.NETLIFY_BLOBS_TOKEN = 'banc-blobs-token';

// Shim des dépendances natives non installées pour un banc unitaire :
//  - googleapis : tiré seulement par la lane téléchargement, jamais exercé sous ro (403 avant tout appel Drive) ;
//  - @netlify/blobs : remplacé par un store EN MÉMOIRE (par nom), pour tester le mint/consume de l'emprunt
//    (remise à usage unique + audit) sans backend réel. Stores partagés entre invocations du même nom.
const _stores = {};
const _Module = require('module');
const _origLoad = _Module._load;
_Module._load = function (request) {
  if (request === 'googleapis') return { google: {} };
  if (request === '@netlify/blobs') return { getStore: (opts) => {
    const name = (opts && opts.name) || 'default';
    const m = _stores[name] || (_stores[name] = new Map());
    return {
      setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
      set: async (k, v) => { m.set(k, v); },
      get: async (k, o) => { const raw = m.get(k); if (raw === undefined) return null; return (o && o.type === 'json') ? JSON.parse(raw) : raw; },
      delete: async (k) => { m.delete(k); },
      list: async () => ({ blobs: [...m.keys()].map(key => ({ key })) })
    };
  } };
  return _origLoad.apply(this, arguments);
};

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const CHEF_ID = '33333333-3333-3333-3333-333333333333', CHEF_CODE = 'CLE00000';   // gestionnaire (porte la clé)
const CHEF2_ID = '44444444-4444-4444-4444-444444444444', CHEF2_CODE = 'NOCLE000'; // membre sans la clé
const CHEF_GERE = { id: CHEF_ID, properties: { 'Nom': { title: [{ plain_text: 'Chef' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF_CODE }] }, 'Role': { select: { name: 'Chef' } }, 'Peut gérer les accès': { checkbox: true } } };
const CHEF_SIMPLE = { id: CHEF2_ID, properties: { 'Nom': { title: [{ plain_text: 'Simple' }] }, 'Code acces': { rich_text: [{ plain_text: CHEF2_CODE }] }, 'Role': { select: { name: 'Monteur' } }, 'Peut gérer les accès': { checkbox: false } } };

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';

const { signer, verifier } = require('../netlify/functions/_clienttoken');
const { appelNotion, estLecture, RefusLectureSeule } = require('../netlify/functions/_notionio');

const ID = '11111111-1111-1111-1111-111111111111';          // id de page du contact emprunté (Claire, B33)
const RETOUR_ID = '22222222-2222-2222-2222-222222222222';   // id d'un brouillon à supprimer
const ID2 = '55555555-5555-5555-5555-555555555555';         // 2e contact actif de B33 (Alice) — 1er par nom
const ID_B77 = '66666666-6666-6666-6666-666666666666';      // contact actif d'une marque FERMÉE (B77)

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

// ── Pages Notion simulées (juste ce qu'il faut pour que le portier passe) ────────────────────────────────
const CONTACT = { id: ID, properties: {
  'Mail': { email: 'claire@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] },
  'Code acces': { rich_text: [{ plain_text: 'XXXXXXXX' }] }, 'Actif': { checkbox: true },
  'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const CONTACT2 = { id: ID2, properties: {
  'Nom': { title: [{ plain_text: 'Alice' }] }, 'Actif': { checkbox: true },
  'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const CONTACT_B77 = { id: ID_B77, properties: {
  'Nom': { title: [{ plain_text: 'Zoé' }] }, 'Actif': { checkbox: true },
  'Code Brand': { rich_text: [{ plain_text: 'B77' }] }, 'Marque': { rich_text: [{ plain_text: 'FerméeSA' }] } } };
const BRAND = { id: 'brand', properties: {
  'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };
const BRAND77 = { id: 'brand77', properties: { // marque FERMÉE : a un contact actif mais l'espace n'est pas ouvert
  'Code': { rich_text: [{ plain_text: 'B77' }] }, 'Espace client activé': { checkbox: false } } };
const BRAND88 = { id: 'brand88', properties: { // marque OUVERTE mais SANS aucun contact actif
  'Code': { rich_text: [{ plain_text: 'B88' }] }, 'Espace client activé': { checkbox: true } } };
const SUJET = { id: 'sujetpage', properties: {
  'Code': { rich_text: [{ plain_text: 'B33D' }] }, 'Visible espace client': { checkbox: true },
  'Format': { select: { name: 'Brand' } }, 'Titre': { title: [{ plain_text: 'Sujet' }] },
  'Statut': { select: { name: 'Séquencier en cours' } },
  'Validation Brand': { checkbox: true }, 'Validation Client': { checkbox: false } } };
const VERSION = { id: 'versionpage', properties: {
  'Sujet ID': { rich_text: [{ plain_text: 'sujetpage' }] }, 'Date envoi client': { date: { start: '2025-01-01' } },
  'Titre': { title: [{ plain_text: 'film.mp4' }] }, 'Version': { rich_text: [{ plain_text: 'V2' }] } } };
const RETOUR = { id: RETOUR_ID, parent: { database_id: DB_RETOURS }, properties: {
  'Source': { select: { name: 'Client' } }, 'Contact client': { rich_text: [{ plain_text: ID }] },
  'Sujet ID': { rich_text: [{ plain_text: 'sujetpage' }] }, 'Version': { select: { name: 'V2' } },
  'Brouillon': { checkbox: true } } };

// ── Recorder + stub réseau ───────────────────────────────────────────────────────────────────────────────
let reseau = [];
const rep = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200,
  json: async () => obj, text: async () => JSON.stringify(obj), headers: { get: () => null } });
function stub(url, opt) {
  const method = (opt && opt.method) || 'GET';
  const u = String(url);
  reseau.push({ method, url: u });
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === DB_EQUIPE) return Promise.resolve(rep({ results: [CHEF_GERE, CHEF_SIMPLE] }));
    if (db === process.env.DB_CONTACTS_CLIENT) return Promise.resolve(rep({ results: [CONTACT, CONTACT2, CONTACT_B77] }));
    if (db === DB_CLIENTS_BRAND) return Promise.resolve(rep({ results: [BRAND, BRAND77, BRAND88] }));
    if (db === DB_PROD) return Promise.resolve(rep({ results: [SUJET] }));
    if (db === DB_VERSIONS) return Promise.resolve(rep({ results: [VERSION] }));
    if (db === DB_RETOURS) return Promise.resolve(rep({ results: [RETOUR] }));
    return Promise.resolve(rep({ results: [] }));
  }
  if (method === 'GET' && /\/pages\//.test(u)) return Promise.resolve(rep(RETOUR));
  if (/\/pages(\/|$)/.test(u)) return Promise.resolve(rep({ id: 'created' })); // création/patch (atteint seulement hors ro)
  return Promise.resolve(rep({}));
}
global.fetch = stub;

const mutationVersPages = (e) => /^(POST|PATCH|PUT|DELETE)$/.test(e.method) && /\/pages(\/|$)/.test(e.url) && !/\/query$/.test(e.url);
const evt = (jeton, body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(body) });

(async () => {
  // ── 1) JETON ───────────────────────────────────────────────────────────────────────────────────────────
  console.log('\n\x1b[1mJeton — marqueur ro signé, absent d\'un vrai jeton client\x1b[0m');
  const normal = signer(ID);
  const emprunt = signer(ID, { ro: true, acteur: 'chef-9', ttlMs: 15 * 60 * 1000 });
  const vN = verifier(normal.token), vE = verifier(emprunt.token);
  ok('jeton client normal → ro:false, acteur vide', vN.ok && vN.ro === false && vN.acteur === '');
  ok('jeton emprunt → ro:true', vE.ok && vE.ro === true);
  ok('jeton emprunt → acteur (id chef) relayé pour l\'audit', vE.acteur === 'chef-9');
  ok('jeton emprunt → exp court (~15 min, pas 14 j)', (() => {
    const p = JSON.parse(Buffer.from(emprunt.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const dms = p.exp - Date.now(); return dms > 10 * 60 * 1000 && dms < 20 * 60 * 1000;
  })());
  // Marqueur infalsifiable : bricoler ro dans la charge casse la signature → jeton invalide.
  ok('charge ro trafiquée → signature invalide (infalsifiable)', (() => {
    const [p, s] = normal.token.split('.');
    const charge = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    charge.ro = 1; const faux = Buffer.from(JSON.stringify(charge)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return verifier(faux + '.' + s).ok === false;
  })());

  // ── 2) POINT DE PASSAGE UNIQUE appelNotion ──────────────────────────────────────────────────────────────
  console.log('\n\x1b[1mappelNotion — refus des écritures sous ro, lectures permises\x1b[0m');
  ok('estLecture : GET = lecture', estLecture('GET', '/pages/x') === true);
  ok('estLecture : POST .../query = lecture', estLecture('POST', '/databases/x/query') === true);
  ok('estLecture : POST /pages = écriture', estLecture('POST', '/pages') === false);
  ok('estLecture : PATCH /pages/x = écriture', estLecture('PATCH', '/pages/x') === false);

  const essai = async (ro, chemin, methode) => {
    reseau = [];
    try { await appelNotion(ro, chemin, methode, 't', methode === 'GET' ? undefined : {}); return { jete: false }; }
    catch (e) { return { jete: true, ro: !!(e && e.lectureSeule), inst: e instanceof RefusLectureSeule }; }
  };
  // Les SIX écritures réelles sont un POST /pages ou un PATCH /pages/<id>.
  for (const [chemin, methode] of [['/pages', 'POST'], ['/pages/x', 'PATCH']]) {
    const r = await essai(true, chemin, methode);
    ok('ro + ' + methode + ' ' + chemin + ' → refusé AVANT le réseau', r.jete && r.ro && r.inst && reseau.length === 0);
  }
  const rQuery = await essai(true, '/databases/d/query', 'POST');
  ok('ro + POST .../query → passe (lecture), réseau touché', !rQuery.jete && reseau.length === 1);
  const rGet = await essai(true, '/pages/x', 'GET');
  ok('ro + GET /pages/x → passe (lecture), réseau touché', !rGet.jete && reseau.length === 1);
  const rNormW = await essai(false, '/pages', 'POST');
  ok('NORMAL + POST /pages → passe (écriture autorisée), réseau touché', !rNormW.jete && reseau.length === 1);

  // ── 3) LES TROIS FONCTIONS — ro → 403 sur chaque écriture, rien de mutant au réseau ─────────────────────
  const montage = require('../netlify/functions/montage-client').handler;
  const valider = require('../netlify/functions/valider-client').handler;
  const seq = require('../netlify/functions/valider-sequencier-client').handler;

  const S = { sujetCode: 'B33D' };
  // Les six écritures client réelles, chacune avec un corps valide pour ATTEINDRE son écriture.
  const ECRITURES = [
    ['montage · ajouter-retour',        montage, Object.assign({ action: 'ajouter-retour', texte: 'un retour' }, S)],
    ['montage · supprimer-brouillon',   montage, Object.assign({ action: 'supprimer-brouillon', retourId: RETOUR_ID }, S)],
    ['valider-client · valider',        valider, Object.assign({ action: 'valider', nbVersions: 1 }, S)],
    ['valider-client · envoyer-retours', valider, Object.assign({ action: 'envoyer-retours', nbVersions: 1 }, S)],
    ['valider-sequencier · valider',    seq,     Object.assign({ action: 'valider' }, S)],
    ['valider-sequencier · corrections', seq,    Object.assign({ action: 'corrections', texte: 'à revoir' }, S)]
  ];

  console.log('\n\x1b[1mJeton ro → 403 sur chacune des six écritures (et zéro mutation au réseau)\x1b[0m');
  for (const [nom, h, body] of ECRITURES) {
    reseau = [];
    const res = await h(evt(emprunt.token, body));
    const mut = reseau.filter(mutationVersPages);
    ok(nom + ' → 403 ET aucune écriture /pages atteinte', res.statusCode === 403 && mut.length === 0);
  }

  console.log('\n\x1b[1mJeton ro → 200 sur les lectures\x1b[0m');
  const lire = await montage(evt(emprunt.token, Object.assign({ action: 'lire' }, S)));
  ok('montage · lire → 200 (lecture autorisée sous ro)', lire.statusCode === 200);
  ok('montage · lire → aucune écriture /pages', reseau.filter(mutationVersPages).length === 0);

  console.log('\n\x1b[1mJeton NORMAL → l\'écriture est bien tentée (garde propre au ro)\x1b[0m');
  for (const [nom, h, body] of [ECRITURES[0], ECRITURES[2], ECRITURES[4]]) { // ajouter-retour, valider montage, valider séquencier
    reseau = [];
    const res = await h(evt(normal.token, body));
    const mut = reseau.filter(mutationVersPages);
    ok(nom + ' (normal) → écriture /pages atteinte, pas de 403', mut.length >= 1 && res.statusCode !== 403);
  }

  // ── 4) TÉLÉCHARGEMENT (décision 5) — refusé sous ro, HORS de la serrure Notion ──────────────────────────
  // Un téléchargement n'est pas une mutation Notion : il ne passe pas par appelNotion. Le refus vit dans le
  // handler, au même endroit que les écritures (juste après autoriserMontage, qui relaie ro).
  console.log('\n\x1b[1mTéléchargement du livrable — refusé sous ro (décision 5)\x1b[0m');
  const download = require('../netlify/functions/drive-download-client').handler;
  const dlRo = await download(evt(emprunt.token, { sujetCode: 'B33D', rang: 1 }));
  ok('drive-download-client (ro) → 403', dlRo.statusCode === 403);
  const dlN = await download(evt(normal.token, { sujetCode: 'B33D', rang: 1 }));
  ok('drive-download-client (normal) → passe la garde (pas de 403)', dlN.statusCode !== 403);

  // ── 5) ENTRÉE — mint « Voir incognito » : gardé par la clé, signe un ro 15 min, remise à usage unique ──
  console.log('\n\x1b[1mEntrée (mint/consume) — gardé par « Peut gérer les accès »\x1b[0m');
  const create = require('../netlify/functions/client-emprunt-create').handler;
  const consume = require('../netlify/functions/client-emprunt-consume').handler;
  const evtChef = (id, code, body) => ({ httpMethod: 'POST', headers: { 'x-rm-id': id, 'x-rm-code': code }, body: JSON.stringify(body) });

  // Gestionnaire + contact actif → remise émise.
  const cRes = await create(evtChef(CHEF_ID, CHEF_CODE, { contactId: ID }));
  const cBody = JSON.parse(cRes.body || '{}');
  ok('mint (gestionnaire, contact actif) → 200 + remise', cRes.statusCode === 200 && cBody.ok && !!cBody.token);

  // Consommation → jeton ro, acteur = chef, TTL ~15 min.
  const kRes = await consume({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: cBody.token }) });
  const kBody = JSON.parse(kRes.body || '{}');
  const vK = kBody.token ? verifier(kBody.token) : { ok: false };
  ok('consume → 200 + jeton de session', kRes.statusCode === 200 && kBody.ok && !!kBody.token);
  ok('jeton consommé est ro', vK.ok && vK.ro === true);
  ok('jeton consommé porte acteur = id du chef', vK.acteur === CHEF_ID);
  ok('jeton consommé impersonne le COMMENTATEUR (contactId)', vK.id && vK.id.replace(/-/g, '') === ID.replace(/-/g, ''));
  ok('jeton consommé expire ~15 min', (() => { const d = (kBody.exp || 0) - Date.now(); return d > 13 * 60000 && d < 17 * 60000; })());

  // Usage unique : seconde consommation refusée.
  const k2 = await consume({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: cBody.token }) });
  ok('remise à USAGE UNIQUE : seconde consommation → 404', k2.statusCode === 404);

  // Non-gestionnaire → refus.
  const cNo = await create(evtChef(CHEF2_ID, CHEF2_CODE, { contactId: ID }));
  ok('mint sans la clé « Peut gérer les accès » → 403', cNo.statusCode === 403);

  // Contact inconnu / inactif → refus (on n'emprunte pas une identité sans accès).
  const cUnknown = await create(evtChef(CHEF_ID, CHEF_CODE, { contactId: '99999999-9999-9999-9999-999999999999' }));
  ok('mint vers un contact inconnu → 403', cUnknown.statusCode === 403);

  // Audit : une entrée a bien été écrite à la frappe.
  ok('audit Blobs : une entrée écrite par mint réussi', (_stores['emprunt-audit'] ? _stores['emprunt-audit'].size : 0) >= 1);

  // ── 6) 2ᵉ PORTE — depuis la CARTE (sujetCode), sans qu'un client ait commenté ───────────────────────────
  console.log('\n\x1b[1mEntrée depuis la carte — marque dérivée du code, contact actif déterministe\x1b[0m');
  // B33 a deux contacts actifs (Alice, Claire) → premier par nom = Alice (ID2).
  const crte = await create(evtChef(CHEF_ID, CHEF_CODE, { sujetCode: 'B33D' }));
  const crteB = JSON.parse(crte.body || '{}');
  ok('carte B33D (gestionnaire) → 200 + remise', crte.statusCode === 200 && crteB.ok && !!crteB.token);
  const krte = await consume({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ token: crteB.token }) });
  const krteB = JSON.parse(krte.body || '{}');
  const vC = krteB.token ? verifier(krteB.token) : { ok: false };
  ok('jeton (carte) est ro', vC.ok && vC.ro === true);
  ok('choix DÉTERMINISTE : 1er contact actif par nom (Alice, pas Claire)', vC.id && vC.id.replace(/-/g, '') === ID2.replace(/-/g, ''));

  // Marque fermée (B77 a un contact actif mais l'espace n'est pas ouvert) → 403 « réglage », pas une panne.
  const cFerm = await create(evtChef(CHEF_ID, CHEF_CODE, { sujetCode: 'B77A' }));
  const cFermB = JSON.parse(cFerm.body || '{}');
  ok('carte d\'une marque FERMÉE → 403', cFerm.statusCode === 403);
  ok('403 dit que c\'est un réglage (« pas encore ouvert »)', /pas encore ouvert/i.test(cFermB.error || ''));

  // Marque ouverte mais SANS contact actif (B88) → 404 distinct.
  const cVide = await create(evtChef(CHEF_ID, CHEF_CODE, { sujetCode: 'B88X' }));
  const cVideB = JSON.parse(cVide.body || '{}');
  ok('carte d\'une marque sans interlocuteur actif → 404', cVide.statusCode === 404);
  ok('404 « Aucun interlocuteur actif pour cette marque. »', /aucun interlocuteur actif/i.test(cVideB.error || ''));

  // Code de carte sans marque exploitable → 400 (validé par CODE_BRAND_RE, pas une 2e regex).
  const cMal = await create(evtChef(CHEF_ID, CHEF_CODE, { sujetCode: 'XYZ' }));
  ok('carte sans code marque exploitable → 400', cMal.statusCode === 400);

  // La carte garde la garde de clé : sans « Peut gérer les accès » → 403.
  const cNoKey = await create(evtChef(CHEF2_ID, CHEF2_CODE, { sujetCode: 'B33D' }));
  ok('carte sans la clé « Peut gérer les accès » → 403', cNoKey.statusCode === 403);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
