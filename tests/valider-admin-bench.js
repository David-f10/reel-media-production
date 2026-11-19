'use strict';
// Banc — « validation réservée à l'admin » (serveur), les DEUX routes valider. Réseau mocké. Prouve, chacun mordant :
//   (a) REPLI : marque SANS porteur de « Peut gérer les accès » → un non-porteur VALIDE (comme avant) ;
//   (b) marque AVEC porteur → un non-porteur → 403 sur 'valider' ;        (c) le porteur, lui, valide ;
//   (d) 'envoyer-retours' ET 'corrections' restent OUVERTES à tous, dans les deux configs (régression la + chère) ;
//   (e) le repli compte les porteurs INACTIFS (un porteur désactivé MAINTIENT la restriction, il ne la lève pas) ;
//   (f) les noms affichés ne listent que les porteurs ACTIFS ;            (g) porteurs mais aucun actif → générique ;
//   (h) ⛔ aucun mail/code/id de contact dans la réponse qui porte les noms ;
//   (i) ro → 403 sur les deux 'valider' (inchangé) ;
//   (k) adminsMarque en ÉCHEC → refus, mais message ET code DISTINCTS du « pas administrateur » (503, pas 403).

process.env.CLIENT_SIGN_SECRET = 'banc-secret-valid';
process.env.NOTION_TOKEN = 'banc-notion-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';
process.env.NETLIFY_SITE_ID = 'banc-site';
process.env.NETLIFY_BLOBS_TOKEN = 'banc-blobs-token';

// Shim des natives non installées (comme emprunt-lecture-seule-bench).
const _Module = require('module'); const _origLoad = _Module._load;
_Module._load = function (request) {
  if (request === 'googleapis') return { google: {} };
  if (request === '@netlify/blobs') return { getStore: () => ({ setJSON: async () => {}, set: async () => {}, get: async () => null, delete: async () => {}, list: async () => ({ blobs: [] }) }) };
  return _origLoad.apply(this, arguments);
};

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';

// ── Contacts : plusieurs marques, chacune une config de porteurs ─────────────────────────────────────────
// nom, codeBrand, actif, gere(porteur ?). Mail/Code acces présents pour PROUVER qu'ils ne fuient pas.
const ct = (id, nom, brand, actif, gere) => { const pr = {
  'Nom': { title: [{ plain_text: nom }] },
  'Mail': { rich_text: [{ plain_text: nom.toLowerCase().replace(/\s+/g, '') + '@x.fr' }] },
  'Code acces': { rich_text: [{ plain_text: 'CODE-' + id.slice(0, 4) }] },
  'Code Brand': { rich_text: [{ plain_text: brand }] },
  'Marque': { rich_text: [{ plain_text: 'Marque' + brand }] },
  'Actif': { checkbox: actif } };
  if (gere) pr['Peut gérer les accès'] = { checkbox: true };
  return { id, properties: pr }; };

const C33 = '33333333-3333-3333-3333-333333333331'; // Claire, B33, non-porteur
const A33 = '33333333-3333-3333-3333-333333333332'; // Alice Admin, B33, porteur ACTIF
const O33 = '33333333-3333-3333-3333-333333333333'; // Zoe Dormante, B33, porteur INACTIF (ne doit pas être nommée)
const Z88 = '88888888-8888-8888-8888-888888888881'; // Zoe, B88, non-porteur (B88 = repli, aucun porteur)
const U77 = '77777777-7777-7777-7777-777777777771'; // User, B77, non-porteur
const F77 = '77777777-7777-7777-7777-777777777772'; // Bob, B77, porteur INACTIF (seul porteur → générique)
const U99 = '99999999-9999-9999-9999-999999999990'; // User, B99, non-porteur
const P99 = ['1', '2', '3', '4'].map(n => '99999999-9999-9999-9999-99999999999' + n); // 4 porteurs ACTIFS → >3 → générique

const CONTACTS = [
  ct(C33, 'Claire Besson', 'B33', true, false),
  ct(A33, 'Alice Admin', 'B33', true, true),
  ct(O33, 'Zoe Dormante', 'B33', false, true),       // porteur INACTIF
  ct(Z88, 'Zoe Libre', 'B88', true, false),
  ct(U77, 'Ulysse Simple', 'B77', true, false),
  ct(F77, 'Bob Dormant', 'B77', false, true),         // SEUL porteur, inactif
  ct(U99, 'Ulrich Simple', 'B99', true, false)
].concat(P99.map((id, i) => ct(id, 'Admin' + (i + 1) + ' Neuf', 'B99', true, true)));

const BRANDS = ['B33', 'B88', 'B77', 'B99'].map(code => ({ id: 'brand-' + code, properties: { 'Code': { rich_text: [{ plain_text: code }] }, 'Espace client activé': { checkbox: true } } }));

const sujetPour = (code, vis) => ({ id: 'sujet-' + code, properties: {
  'Code': { rich_text: [{ plain_text: code }] },
  'Format': { select: { name: 'Brand' } },
  'Titre': { title: [{ plain_text: 'Sujet ' + code }] },
  'Statut': { select: { name: 'Séquencier en cours' } },
  'Visible espace client': { checkbox: !!vis },
  'Validation Brand': { checkbox: true }, 'Validation Client': { checkbox: false } } });
const VERSION = { id: 'versionpage', properties: {
  'Sujet ID': { rich_text: [{ plain_text: 'sujet-B33D' }] }, 'Date envoi client': { date: { start: '2025-01-01' } },
  'Titre': { title: [{ plain_text: 'film.mp4' }] }, 'Version': { rich_text: [{ plain_text: 'V2' }] } } };

let reseau = [];
const rep = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, text: async () => JSON.stringify(obj), headers: { get: () => null } });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  reseau.push({ method, url: u });
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return Promise.resolve(rep({ results: CONTACTS }));
    if (db === DB_CLIENTS_BRAND) return Promise.resolve(rep({ results: BRANDS }));
    if (db === DB_VERSIONS) return Promise.resolve(rep({ results: [VERSION] }));
    if (db === DB_PROD) {
      let b = {}; try { b = JSON.parse(opt.body || '{}'); } catch (e) {}
      const f = b.filter || {};
      if (f.and) { const pref = (f.and[0] && f.and[0].rich_text && f.and[0].rich_text.starts_with) || ''; return Promise.resolve(rep({ results: [sujetPour(pref + 'D', true)] })); } // projetsDeMarque
      if (f.property === 'Code' && f.rich_text && f.rich_text.equals) return Promise.resolve(rep({ results: [sujetPour(f.rich_text.equals, true)] }));            // seq / re-lecture sujet
      return Promise.resolve(rep({ results: [] }));
    }
    return Promise.resolve(rep({ results: [] }));
  }
  if (method === 'GET' && /\/pages\//.test(u)) return Promise.resolve(rep({ id: 'x' }));
  if (/\/pages(\/|$)/.test(u)) return Promise.resolve(rep({ id: 'created' }));
  return Promise.resolve(rep({}));
};

const { signer } = require('../netlify/functions/_clienttoken');
const valider = require('../netlify/functions/valider-client').handler;
const seq = require('../netlify/functions/valider-sequencier-client').handler;
const evt = (jeton, body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(body) });
const tok = (id, ro) => signer(id, ro ? { ro: true, acteur: 'chef' } : undefined).token;

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const body = (res) => { try { return JSON.parse(res.body || '{}'); } catch (e) { return {}; } };

(async () => {
  // ───────── valider-sequencier-client (chemin simple : contactActif + sujet par code) ─────────
  console.log('\n\x1b[1mvalider-sequencier — repli, restriction, noms, générique\x1b[0m');
  // (a) B88 : aucun porteur → repli → le non-porteur VALIDE.
  let r = await seq(evt(tok(Z88), { action: 'valider', sujetCode: 'B88X' }));
  ok('(a) REPLI (aucun porteur) → non-porteur valide (200, pas 403)', r.statusCode === 200 && r.statusCode !== 403);
  // (b) B33 : porteur présent → non-porteur (Claire) → 403.
  r = await seq(evt(tok(C33), { action: 'valider', sujetCode: 'B33X' }));
  let b = body(r);
  ok('(b) marque AVEC porteur → non-porteur → 403', r.statusCode === 403);
  ok('(f) la phrase nomme le porteur ACTIF (Alice Admin)', /Alice Admin/.test(b.error || ''));
  ok('(f) ⛔ ne nomme PAS le porteur INACTIF (Zoe Dormante)', !/Zoe Dormante/.test(b.error || ''));
  ok('la phrase est « La validation revient à … »', /^La validation revient à /.test(b.error || ''));
  ok('(h) ⛔ aucun mail (@), aucun code (CODE-), aucun id de contact dans la réponse', !/@|CODE-|3{8}|3333-3333/.test(r.body || ''));
  // (c) le porteur actif (Alice) valide.
  r = await seq(evt(tok(A33), { action: 'valider', sujetCode: 'B33X' }));
  ok('(c) le porteur (Alice) valide → 200 (pas 403)', r.statusCode === 200 && r.statusCode !== 403);
  // (e) B77 : SEUL porteur inactif → la restriction tient (non-porteur → 403).
  r = await seq(evt(tok(U77), { action: 'valider', sujetCode: 'B77X' }));
  b = body(r);
  ok('(e) porteur INACTIF seul → restriction MAINTENUE (non-porteur → 403)', r.statusCode === 403);
  // (g) … mais aucun actif → phrase GÉNÉRIQUE (pas de nom).
  ok('(g) aucun porteur actif → phrase générique « un administrateur de … »', /un administrateur de /.test(b.error || '') && !/Bob Dormant/.test(b.error || ''));
  // >3 porteurs actifs (B99) → générique aussi.
  r = await seq(evt(tok(U99), { action: 'valider', sujetCode: 'B99X' }));
  ok('>3 porteurs actifs → phrase générique', /un administrateur de /.test(body(r).error || ''));

  console.log('\n\x1b[1m(d) « corrections » reste OUVERT à tous (les deux configs)\x1b[0m');
  r = await seq(evt(tok(C33), { action: 'corrections', sujetCode: 'B33X', texte: 'à revoir' }));
  ok('non-porteur en marque RESTREINTE → corrections → 200 (pas 403)', r.statusCode === 200 && r.statusCode !== 403);
  r = await seq(evt(tok(Z88), { action: 'corrections', sujetCode: 'B88X', texte: 'à revoir' }));
  ok('non-porteur en marque REPLI → corrections → 200', r.statusCode === 200);

  // ───────── valider-client (montage) : même garde, câblée via autoriserMontage ─────────
  console.log('\n\x1b[1mvalider-client (montage) — même garde\x1b[0m');
  r = await valider(evt(tok(C33), { action: 'valider', sujetCode: 'B33D', nbVersions: 1 }));
  ok('(b) non-porteur (Claire) → valider montage → 403', r.statusCode === 403);
  ok('(f) la phrase nomme Alice Admin, pas Zoe Dormante', /Alice Admin/.test(body(r).error || '') && !/Zoe Dormante/.test(body(r).error || ''));
  r = await valider(evt(tok(A33), { action: 'valider', sujetCode: 'B33D', nbVersions: 1 }));
  ok('(c) porteur (Alice) → valider montage → 200 (pas 403)', r.statusCode === 200 && r.statusCode !== 403);
  r = await valider(evt(tok(C33), { action: 'envoyer-retours', sujetCode: 'B33D', nbVersions: 1 }));
  ok('(d) non-porteur → envoyer-retours → PAS 403 (reste ouvert)', r.statusCode !== 403);

  console.log('\n\x1b[1m(i) emprunt ro → 403 sur les deux valider (inchangé)\x1b[0m');
  ok('valider-sequencier (ro) → 403', (await seq(evt(tok(C33, true), { action: 'valider', sujetCode: 'B33X' }))).statusCode === 403);
  ok('valider-client (ro) → 403', (await valider(evt(tok(C33, true), { action: 'valider', sujetCode: 'B33D', nbVersions: 1 }))).statusCode === 403);

  // ───────── (k) adminsMarque en ÉCHEC → fail-closed DISTINCT ─────────
  console.log('\n\x1b[1m(k) adminsMarque en échec → refus 503 DISTINCT du 403 « pas admin »\x1b[0m');
  const auth = require('../netlify/functions/_authclient');
  auth.adminsMarque = async () => ({ ok: false, raison: 'indispo' }); // force l'échec (contactActif reste réel)
  delete require.cache[require.resolve('../netlify/functions/valider-sequencier-client')];
  delete require.cache[require.resolve('../netlify/functions/valider-client')];
  const seqK = require('../netlify/functions/valider-sequencier-client').handler;
  const validerK = require('../netlify/functions/valider-client').handler;
  const rk1 = await seqK(evt(tok(C33), { action: 'valider', sujetCode: 'B33X' }));
  const rk2 = await validerK(evt(tok(C33), { action: 'valider', sujetCode: 'B33D', nbVersions: 1 }));
  ok('valider-sequencier : échec vérif → 503 (PAS 403)', rk1.statusCode === 503);
  ok('valider-client : échec vérif → 503 (PAS 403)', rk2.statusCode === 503);
  ok('⛔ message DISTINCT : « momentanément indisponible », pas la phrase des noms', /momentanément indisponible/i.test(body(rk1).error || '') && !/revient à/.test(body(rk1).error || ''));
  ok('les deux routes donnent le MÊME message d\'indispo', body(rk1).error === body(rk2).error);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
