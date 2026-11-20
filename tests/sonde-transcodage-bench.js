'use strict';
// Banc — la sonde transcodage (outil de diagnostic temporaire). Prouve, sans réseau :
//   · GET → formulaire, ⛔ AUCUN accès Drive ;
//   · POST sans identifiants / mauvais code → 403, ⛔ aucune mesure dans la réponse ;
//   · POST identifiants valides + fileId → verdict (la sonde tourne) ;
//   · ⛔ THROTTLE : des essais de code répétés déclenchent le compteur POLICE_EQUIPE → 429, et un BON code
//     ensuite (dans la fenêtre de cooldown) est refusé AUSSI — la porte n'est pas un guichet de devinette ;
//   · ⛔ le code soumis n'est JAMAIS recopié dans une réponse.

process.env.NOTION_TOKEN = 'banc-token';
process.env.NETLIFY_SITE_ID = 'banc-site';
process.env.NETLIFY_BLOBS_TOKEN = 'banc-blobs';

// Shim des natives : googleapis (tiré par _drive, jamais appelé ici — on mocke getSA via fetch) + @netlify/blobs
// (store EN MÉMOIRE partagé par nom → le compteur throttle s'accumule vraiment entre les appels).
const _stores = {};
const _Module = require('module'); const _orig = _Module._load;
_Module._load = function (request) {
  if (request === 'googleapis') return { google: {} };
  if (request === '@netlify/blobs') return { getStore: (o) => { const n = (o && o.name) || 'd'; const m = _stores[n] || (_stores[n] = new Map());
    return { setJSON: async (k, v) => m.set(k, JSON.stringify(v)), set: async (k, v) => m.set(k, v), get: async (k, opt) => { const r = m.get(k); if (r === undefined) return null; return (opt && opt.type === 'json') ? JSON.parse(r) : r; }, delete: async (k) => m.delete(k), list: async () => ({ blobs: [...m.keys()].map(key => ({ key })) }) }; } };
  return _orig.apply(this, arguments);
};

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const MID = 'membre-1';
const BON_CODE = 'BONCODE-EQUIPE'; // fixture (pas un vrai code)
const MEMBRE = { id: MID, properties: { 'Nom': { title: [{ plain_text: 'Membre' }] }, 'Code acces': { rich_text: [{ plain_text: BON_CODE }] }, 'Role': { select: { name: 'Chef' } } } };

let driveTouche = false;
const repJson = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
const repDrive = (status, headers, body) => Promise.resolve({ ok: status < 400, status, headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null }, json: () => Promise.resolve(body || {}), text: () => Promise.resolve(''), body: null });
global.fetch = function (url, opt) {
  const u = String(url);
  if (/api\.notion\.com\/.+\/query$/.test(u)) { const db = u.match(/\/databases\/(.+?)\/query$/); if (db && db[1] === DB_EQUIPE) return repJson({ results: [MEMBRE] }); return repJson({ results: [] }); }
  if (/googleapis\.com\/drive/.test(u)) {
    driveTouche = true;
    if (/\?fields=size/.test(u)) return repDrive(200, {}, { size: '99202551' });
    if (/\/download\?mimeType=/.test(u)) return repDrive(200, { 'content-type': 'video/mp4', 'content-range': 'bytes 0-0/40000000' }, {}); // transcodé PLUS PETIT
    return repDrive(206, { 'content-range': 'bytes 0-0/99202551' }, {}); // alt=media = original
  }
  // getSA fait un fetch vers l'auth Google (oauth token) — on le mocke par un jeton factice.
  if (/oauth2|token|googleapis\.com\/oauth/.test(u)) return repJson({ access_token: 'factice', expires_in: 3600 });
  return repJson({});
};

// ⛔ Override getSA AVANT de requérir le handler (il capture drivePkg.getSA au chargement). Jamais une vraie valeur.
const _drive = require('../netlify/functions/_drive');
_drive.getSA = async () => ({ token: 'factice-sa' });
const { handler } = require('../netlify/functions/sonde-transcodage');

const get = () => ({ httpMethod: 'GET', headers: {}, body: '' });
const post = (id, code, fileId) => ({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '10.0.0.1' }, body: 'id=' + encodeURIComponent(id || '') + '&code=' + encodeURIComponent(code || '') + '&fileId=' + encodeURIComponent(fileId || '') });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mGET → formulaire, aucun accès Drive\x1b[0m');
  driveTouche = false;
  let r = await handler(get());
  ok('GET → 200 HTML', r.statusCode === 200 && /text\/html/.test(r.headers['Content-Type']));
  ok('en-tête d\'avertissement « diagnostic temporaire »', /diagnostic temporaire/i.test(r.body) && /pas la page de connexion/i.test(r.body));
  ok('formulaire autocomplete="off"', /autocomplete="off"/.test(r.body));
  ok('⛔ le GET ne touche PAS Drive', driveTouche === false);

  console.log('\n\x1b[1mPOST sans / mauvais identifiants → 403, aucune mesure\x1b[0m');
  r = await handler(post('', '', 'fileX'));
  ok('aucun identifiant → 403', r.statusCode === 403);
  ok('⛔ aucune mesure (ni « VERDICT » ni « octets ») dans la réponse', r.body.indexOf('VERDICT') === -1 && r.body.indexOf('octets') === -1);
  r = await handler(post(MID, 'MAUVAIS', 'fileX'));
  ok('mauvais code → 403', r.statusCode === 403);

  console.log('\n\x1b[1mPOST valide → la sonde tourne, verdict rendu\x1b[0m');
  r = await handler(post(MID, BON_CODE, 'fileABC'));
  ok('identifiants valides + fileId → 200 + VERDICT', r.statusCode === 200 && r.body.indexOf('VERDICT') === 0 || r.body.indexOf('VERDICT') !== -1);
  ok('le verdict porte les mesures (statut + octets)', /Mesures\s*:/.test(r.body) && /octets/.test(r.body));
  ok('⛔ le code BON_CODE n\'est recopié NULLE PART dans la réponse', r.body.indexOf(BON_CODE) === -1);

  console.log('\n\x1b[1m⛔ THROTTLE — devinette de code → 429, et un bon code ensuite reste bloqué\x1b[0m');
  // Axe id POLICE_EQUIPE : 4 libres puis cooldown. On enchaîne des mauvais codes (appels rapprochés < cooldown).
  let bloque = false, dernier = 0;
  for (let i = 0; i < 8 && !bloque; i++) { const rr = await handler(post(MID, 'MAUVAIS' + i, 'fileX')); dernier = rr.statusCode; if (rr.statusCode === 429) bloque = true; }
  ok('après des essais répétés → 429 (compteur POLICE_EQUIPE déclenché)', bloque === true);
  const rbon = await handler(post(MID, BON_CODE, 'fileX')); // un BON code, DANS la fenêtre de cooldown
  ok('⛔ un BON code pendant le cooldown est refusé AUSSI (429) — pas un guichet de devinette', rbon.statusCode === 429);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
