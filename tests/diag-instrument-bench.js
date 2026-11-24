'use strict';
// Banc — INSTRUMENT TEMPORAIRE (diag). Couvre LES DEUX blocs, pas un :
//
//   PARTIE A — SERVEUR (drive-stream.js, en Node, dépendances stubées) :
//     · sous ?diag=1 → quatre en-têtes x-diag-* (froid, budget, getSA, Drive), numériques ;
//     · le drapeau froid vaut 1 à la 1re requête de l'instance, 0 ensuite ;
//     · ⛔ SANS ?diag=1 → AUCUN en-tête x-diag-* (l'instrument est éteint par défaut) ;
//     · la sonde amorce (start=0, palier) touche le compteur de budget ; la sonde milieu (24 Mio, hors palier) non.
//     MORDANT serveur : retirer la condition « if (_diag) { … } » (drive-stream.js) → les en-têtes sortent même
//     sans ?diag → l'assertion « SANS diag → aucun en-tête » TOMBE.
//
//   PARTIE B — NAVIGATEUR (client.html, Chromium) :
//     · page SANS ?diag=1 → pas de bandeau #mt-diag ET aucun fetch vers drive-stream?diag= ;
//     · page AVEC ?diag=1 → bandeau #mt-diag présent ET au moins un fetch vers drive-stream?diag= émis.
//     MORDANT navigateur : retirer « if (!_DIAG) return; » dans mDiagDemarrer (client.html) → le bandeau s'affiche
//     et les sondes partent même sans ?diag → l'assertion « sans ?diag, ni bandeau ni fetch » TOMBE.
//
// ⛔ Aucun réseau réel, aucun secret, aucune valeur de film : les en-têtes ne portent que des durées.
// Lancement : node tests/diag-instrument-bench.js   (ffmpeg non requis ; playwright + chromium préinstallés)

const Module = require('module');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = path.resolve(__dirname, '..');

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

// ───────────────────────── PARTIE A — SERVEUR ─────────────────────────
// Stubs des dépendances du handler (googleapis non installé ; @netlify/blobs idem). Le stub Blobs COMPTE ses
// accès pour prouver que l'amorce (palier) déclenche le compteur et le milieu (hors palier) non.
let storeGets = 0;
process.env.STREAM_COOKIE_SECRET = 'secret-de-banc';
process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'sa@banc.iam' });
// getStreamBudgetStore lève sans ces deux variables (→ le handler fail-open, le compteur ne tourne pas).
// On les fournit pour que la sonde touche bien le stub Blobs et qu'on puisse mesurer le régime palier/hors-palier.
process.env.NETLIFY_SITE_ID = 'banc'; process.env.NETLIFY_BLOBS_TOKEN = 'banc';
const _origLoad = Module._load;
Module._load = function (r) {
  if (r === 'googleapis') return { google: { auth: { GoogleAuth: function () { return { getClient: async () => ({ getAccessToken: async () => ({ token: 'tok' }) }) }; } } } };
  if (r === '@netlify/blobs') return { getStore: () => ({ get: async () => { storeGets++; return null; }, setJSON: async () => {} }) };
  return _origLoad.apply(this, arguments);
};
const ck = require(path.join(RACINE, 'netlify/functions/_streamcookie.js'));
const COOKIE = 'rmv=' + encodeURIComponent(ck.signerValeur({ fid: 'F', cid: 'C', exp: Date.now() + 3600000 }, process.env.STREAM_COOKIE_SECRET));
// Drive renvoie un 206 minimal (en-têtes fabriqués côté handler ; ici juste de quoi passer).
global.fetch = async () => ({ status: 206, body: null, headers: { get: (h) => (h === 'content-range' ? 'bytes 0-0/9' : h === 'content-length' ? '1' : null) } });
const reqFor = (url, range) => ({ method: 'HEAD', url: url, headers: { get: (h) => (h === 'cookie' ? COOKIE : h === 'range' ? range : null) } });
const EN = ['x-diag-froid', 'x-diag-budget', 'x-diag-getsa', 'x-diag-drive'];

async function partieServeur() {
  console.log('\n\x1b[1mPARTIE A — relais drive-stream : en-têtes x-diag sous ?diag=1 seulement\x1b[0m');
  const m = await import('file://' + path.join(RACINE, 'netlify/functions/drive-stream.js'));

  // 1er appel diag = amorce (start=0, palier de 64 Mio) → froid 1, le compteur de budget est touché.
  storeGets = 0;
  const a = await m.default(reqFor('https://x/f?diag=1&t=amorce', 'bytes=0-0'));
  ok('amorce : les quatre en-têtes x-diag-* sont présents', EN.every(k => a.headers.get(k) !== null));
  ok('amorce : les quatre valeurs sont numériques (durées en ms)', EN.every(k => /^\d+$/.test(String(a.headers.get(k)))));
  ok('amorce : froid = 1 (première requête de l\'instance)', a.headers.get('x-diag-froid') === '1');
  ok('amorce (palier) : le compteur de budget a été touché (≥1 accès Blobs)', storeGets >= 1);

  // 2e appel diag = milieu (24 Mio, hors palier) → froid 0, compteur NON touché.
  storeGets = 0;
  const b = await m.default(reqFor('https://x/f?diag=1&t=milieu', 'bytes=25165824-25165824'));
  ok('milieu : froid = 0 (instance déjà chaude)', b.headers.get('x-diag-froid') === '0');
  ok('milieu (hors palier) : le compteur de budget n\'est PAS touché (0 accès Blobs)', storeGets === 0);

  // ⛔ SANS ?diag=1 → aucun en-tête (éteint par défaut ; MORDANT serveur).
  const s = await m.default(reqFor('https://x/f?v=1', 'bytes=0-0'));
  ok('⛔ SANS ?diag=1 : AUCUN en-tête x-diag-* (éteint par défaut)', EN.every(k => s.headers.get(k) === null));
}

// ───────────────────────── PARTIE B — NAVIGATEUR ─────────────────────────
function servirStatique() {
  const srv = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    const abs = path.join(RACINE, p === '/' || p === '/client.html' ? 'client.html' : p.replace(/^\//, ''));
    if (!abs.startsWith(RACINE) || !fs.existsSync(abs)) { res.writeHead(404); res.end('x'); return; }
    res.writeHead(200, { 'Content-Type': (abs.endsWith('.js') ? 'application/javascript' : 'text/html') + '; charset=utf-8' });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

const MONTAGE = { ok: true, titre: 'Montage', marque: 'Refashion', versions: [{ rang: 1, dateEnvoi: '2026-10-01', etat: 'a-relire' }], courante: { rang: 1 }, affichee: { rang: 1 }, retours: [], peutValider: true, validationNote: '', orientation: 'portrait' };

// Monte un montage ; renvoie { page, aBandeau, fetchsDiag } — fetchsDiag = nb de requêtes drive-stream?diag=.
async function monter(browser, port, avecDiag) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const urlsDiag = [];
  await ctx.route('**/.netlify/functions/**', (route) => {
    const u = new URL(route.request().url());
    const nom = u.pathname.split('/').pop();
    if (u.search.indexOf('diag=') !== -1) urlsDiag.push(u.href);
    if (nom === 'espace-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, projets: [] }) });
    if (nom === 'montage-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MONTAGE) });
    if (nom === 'drive-stream-open') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Set-Cookie': 'rmv=t; Path=/' }, body: JSON.stringify({ ok: true, expiresDansSec: 7200 }) });
    if (nom === 'drive-stream') return route.fulfill({ status: 206, contentType: 'video/mp4', headers: { 'x-diag-froid': '1', 'x-diag-budget': '10', 'x-diag-getsa': '5', 'x-diag-drive': '20', 'accept-ranges': 'bytes' }, body: 'x' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('rmc-token', 'jeton.factice'); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} });
  await page.goto('http://127.0.0.1:' + port + '/client.html' + (avecDiag ? '?diag=1' : ''));
  await page.waitForTimeout(400);
  await page.evaluate(() => { var z = document.getElementById('zone-projets'); var b = document.createElement('button'); b.setAttribute('data-code', 'TESTCODE'); b.id = 'go'; z.appendChild(b); b.click(); });
  await page.waitForSelector('#mt-video', { timeout: 8000 });
  await page.waitForTimeout(600); // laisse mDiagDemarrer poser le bandeau et émettre les sondes
  const aBandeau = await page.evaluate(() => !!document.getElementById('mt-diag'));
  return { ctx, aBandeau, fetchsDiag: urlsDiag.length };
}

async function partieNavigateur() {
  const { srv, port } = await servirStatique();
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    console.log('\n\x1b[1mPARTIE B — client.html : bandeau + sondes seulement sous ?diag=1\x1b[0m');

    let r = await monter(browser, port, false);
    ok('⛔ sans ?diag=1 : pas de bandeau #mt-diag', r.aBandeau === false);
    ok('⛔ sans ?diag=1 : aucun fetch vers drive-stream?diag=', r.fetchsDiag === 0);
    await r.ctx.close();

    r = await monter(browser, port, true);
    ok('avec ?diag=1 : le bandeau #mt-diag est présent', r.aBandeau === true);
    ok('avec ?diag=1 : au moins un fetch vers drive-stream?diag= est émis', r.fetchsDiag >= 1);
    await r.ctx.close();
  } finally {
    srv.close(); await browser.close();
  }
}

(async () => {
  await partieServeur();
  await partieNavigateur();
  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
