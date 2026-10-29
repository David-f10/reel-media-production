// tests/lecteur-etape2.bench.js
// Banc Playwright — Lecteur natif (étape 2) de l'espace client (client.html).
//
// Exerce RÉELLEMENT, dans un Chromium headless, le comportement du lecteur relais :
//   1. Montage : un <video> natif est monté sur /.netlify/functions/drive-stream, AUCUN id dans l'URL.
//   2. Bande de repères : points (rouge = mien, gris = autre contact) + trait de position, à loadedmetadata.
//   3. Capture au focus (Problème 2) : focus d'un champ VIDE → pause + timecode = image à l'écran ;
//      champ non vide → pause seule, le timecode n'est JAMAIS écrasé.
//   4. Clic sur le timecode d'un retour → vrai seek + lecture (mSauter natif).
//   5. Repli (Problème 1) : mint en échec → bureau = iframe Drive + téléchargement ; iOS = message + téléchargement, PAS d'iframe.
//   6. Échafaudage retiré du rendu : ni « Noter ce moment », ni « Pause », ni pastilles ; phrase de cadrage présente.
//
// La vidéo de test est un petit WebM (codec ouvert) généré par ffmpeg — le Chromium headless le décode (pas le H.264).
// Tous les endpoints Netlify sont moqués (drive-stream-open renvoie ok + Set-Cookie ; drive-stream sert le WebM
// avec Range ; drive-view-client renvoie un fileId pour le repli bureau). Aucun réseau réel, aucun secret.
//
// Lancement :  node tests/lecteur-etape2.bench.js
// Pré-requis : ffmpeg sur le PATH ; playwright + chromium disponibles (préinstallés dans l'env. cloud).

'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const UA_BUREAU = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let nFail = 0, nPass = 0;
function ok(cond, nom) { if (cond) { nPass++; console.log('  \x1b[32m✓\x1b[0m ' + nom); } else { nFail++; console.log('  \x1b[31m✗ ' + nom + '\x1b[0m'); } }

// Payload « lire » du montage (une version courante à relire, deux retours timecodés).
const MONTAGE = {
  ok: true, titre: 'Montage de test',
  versions: [{ rang: 1, dateEnvoi: '2026-10-01', etat: 'a-relire' }],
  courante: { rang: 1 }, affichee: { rang: 1 },
  retours: [
    { timecode: '0:01', texte: 'Repère à moi', categorie: '', mien: true, id: 'r1', brouillon: false },
    { timecode: '0:02', texte: "Repère d'un autre contact", categorie: '', mien: false, id: 'r2', brouillon: false }
  ]
};

function genererWebm() {
  const f = path.join(os.tmpdir(), 'rmc-bench-' + Date.now() + '.webm');
  // 3 s, 160x90, 10 i/s, VP8 (libvpx) — décodé nativement par Chromium.
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=d=3:s=160x90:r=10',
    '-c:v', 'libvpx', '-b:v', '200k', '-an', f], { stdio: 'ignore' });
  return fs.readFileSync(f);
}

function servirStatique() {
  // Sert UNIQUEMENT client.html et client-etat.js (fichiers statiques du dépôt) ; tout le reste est moqué par Playwright.
  const srv = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    const fichier = p === '/' || p === '/client.html' ? 'client.html' : p.replace(/^\//, '');
    const abs = path.join(RACINE, fichier);
    if (!abs.startsWith(RACINE) || !fs.existsSync(abs)) { res.writeHead(404); res.end('nope'); return; }
    const type = abs.endsWith('.js') ? 'application/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port })));
}

// Monte le routage des endpoints Netlify pour un contexte. `streamOpenStatut` = statut renvoyé par
// drive-stream-open (200 = flux OK ; 503 = mint en échec → repli).
async function router(context, webm, streamOpenStatut) {
  await context.route('**/.netlify/functions/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const nom = url.pathname.split('/').pop();

    if (nom === 'espace-client') { // accueil au boot (jeton présent) — on reste neutre
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, projets: [] }) });
    }
    if (nom === 'montage-client') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MONTAGE) });
    }
    if (nom === 'drive-stream-open') {
      if (streamOpenStatut === 200) {
        return route.fulfill({ status: 200, contentType: 'application/json',
          headers: { 'Set-Cookie': 'rmv=test; Path=/.netlify/functions/drive-stream; HttpOnly' },
          body: JSON.stringify({ ok: true, expiresDansSec: 7200 }) });
      }
      return route.fulfill({ status: streamOpenStatut, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'indispo' }) });
    }
    if (nom === 'drive-view-client') { // repli bureau : renvoie un fileId pour l'iframe
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, fileId: 'FAKEFILEID123' }) });
    }
    if (nom === 'drive-stream') { // le relais : sert le WebM, avec Range
      const range = req.headers()['range'];
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        const start = m ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : webm.length - 1;
        const tranche = webm.slice(start, end + 1);
        return route.fulfill({ status: 206,
          headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
            'Content-Range': 'bytes ' + start + '-' + end + '/' + webm.length, 'Content-Length': String(tranche.length) },
          body: tranche });
      }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': String(webm.length) }, body: webm });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

// Ouvre la vue montage en injectant un bouton data-code dans #zone-projets (la délégation existante appelle
// ouvrirMontage) — les fonctions du script sont dans une IIFE, non appelables directement. Puis attend le <video>
// ou le repli.
async function ouvrirMontage(page, attendreVideo) {
  await page.evaluate(() => {
    const z = document.getElementById('zone-projets');
    const b = document.createElement('button');
    b.setAttribute('data-code', 'TESTCODE'); b.id = 'bench-go'; b.textContent = 'go';
    z.appendChild(b); b.click();
  });
  await page.waitForSelector('#mt-scene', { timeout: 8000 });
  if (attendreVideo) await page.waitForFunction(() => { const v = document.querySelector('#mt-video'); return v && v.readyState >= 1; }, { timeout: 10000 });
}

async function main() {
  const webm = genererWebm();
  const { srv, port } = await servirStatique();
  const base = 'http://127.0.0.1:' + port + '/client.html';
  const browser = await chromium.launch();
  try {
    // ───────── Chemin nominal (flux relais OK), UA bureau ─────────
    console.log('\nFlux relais (nominal)');
    let ctx = await browser.newContext({ userAgent: UA_BUREAU });
    await ctx.addInitScript(() => { try { localStorage.setItem('rmc-token', 'jeton-bench'); } catch (e) {} });
    await router(ctx, webm, 200);
    let page = await ctx.newPage();
    await page.goto(base);
    await ouvrirMontage(page, true);

    // 1. <video> natif monté, aucun id dans l'URL.
    const srcVideo = await page.getAttribute('#mt-video', 'src');
    ok(!!srcVideo && srcVideo.indexOf('/.netlify/functions/drive-stream?v=1') === 0, '<video> sur le relais, ?v=1');
    ok(srcVideo.indexOf('drive.google.com') === -1 && !/FILEID|fileId|[a-zA-Z0-9_-]{25,}/.test(srcVideo.replace(/n=\d+/, '')), 'aucun id de fichier dans l\'URL du <video>');
    ok((await page.locator('#mt-scene iframe').count()) === 0, 'pas d\'iframe sur le chemin nominal');

    // 2. Bande de repères + trait de position (après loadedmetadata).
    await page.waitForSelector('#mt-frise:visible', { timeout: 8000 });
    ok((await page.locator('#mt-fr-m, .mt-fr-m').count()) === 2, 'deux repères sur la bande');
    ok((await page.locator('.mt-fr-m:not(.eq)').count()) === 1 && (await page.locator('.mt-fr-m.eq').count()) === 1, 'un repère rouge (mien) + un gris (autre)');
    ok((await page.locator('#mt-fr-head').count()) === 1, 'trait de position présent');

    // 3a. Capture au focus d'un champ VIDE : pause + timecode = currentTime.
    await page.evaluate(() => { const v = document.querySelector('#mt-video'); v.currentTime = 2.0; });
    await page.waitForTimeout(100);
    await page.focus('#mt-txt');
    await page.waitForTimeout(100);
    ok((await page.inputValue('#mt-tc')) === '0:02', 'focus champ vide → timecode capté (0:02)');
    ok(await page.evaluate(() => document.querySelector('#mt-video').paused), 'focus → lecteur en pause');

    // 3b. Pas d'écrasement une fois la rédaction commencée.
    await page.fill('#mt-txt', 'Ma remarque');
    await page.evaluate(() => { const v = document.querySelector('#mt-video'); v.currentTime = 2.9; });
    await page.evaluate(() => document.querySelector('#mt-txt').blur());
    await page.focus('#mt-txt');
    await page.waitForTimeout(100);
    ok((await page.inputValue('#mt-tc')) === '0:02', 'champ non vide → timecode NON écrasé (reste 0:02)');

    // 3c. Annuler remet à zéro → le focus suivant recapture.
    await page.click('#mt-annuler');
    ok((await page.inputValue('#mt-txt')) === '' && (await page.inputValue('#mt-tc')) === '', 'Annuler vide texte + timecode');

    // 4. Clic sur le timecode d'un retour → seek (+ lecture).
    await page.evaluate(() => { const v = document.querySelector('#mt-video'); v.currentTime = 0; });
    await page.locator('.ret-tc-seek').first().click();
    await page.waitForTimeout(200);
    const t = await page.evaluate(() => document.querySelector('#mt-video').currentTime);
    ok(Math.abs(t - 1) < 0.6, 'clic retour 0:01 → seek ≈ 1 s (t=' + t.toFixed(2) + ')');

    // 6. Échafaudage retiré + phrase de cadrage présente.
    ok((await page.locator('#mt-cap, #mt-pause, #mt-pins-wrap, .mt-pins, #mt-moins, #mt-plus').count()) === 0, 'ni « Noter »/« Pause »/pastilles/nudge dans le DOM');
    ok((await page.locator('.mt-phrase').count()) === 1 && (await page.textContent('.mt-phrase')).indexOf("s'arrête quand vous commencez à écrire") !== -1, 'phrase de cadrage validée présente');
    await ctx.close();

    // ───────── Repli BUREAU (mint en échec) ─────────
    console.log('\nRepli bureau (mint 503)');
    ctx = await browser.newContext({ userAgent: UA_BUREAU });
    await ctx.addInitScript(() => { try { localStorage.setItem('rmc-token', 'jeton-bench'); } catch (e) {} });
    await router(ctx, webm, 503);
    page = await ctx.newPage();
    await page.goto(base);
    await ouvrirMontage(page, false);
    await page.waitForSelector('#mt-scene iframe.mt-iframe', { timeout: 8000 });
    ok((await page.locator('#mt-scene iframe.mt-iframe').count()) === 1, 'bureau : iframe Drive de secours montée');
    ok((await page.locator('#mt-repli-tel').count()) === 1, 'bureau : bouton Télécharger présent');
    ok((await page.locator('#mt-repli-reessai').count()) === 1, 'bureau : bouton Réessayer présent');
    ok((await page.locator('#mt-video').count()) === 0, 'bureau : pas de <video> en repli');
    await ctx.close();

    // ───────── Repli iOS (mint en échec) ─────────
    console.log('\nRepli iOS (mint 503)');
    ctx = await browser.newContext({ userAgent: UA_IOS });
    await ctx.addInitScript(() => { try { localStorage.setItem('rmc-token', 'jeton-bench'); } catch (e) {} });
    await router(ctx, webm, 503);
    page = await ctx.newPage();
    await page.goto(base);
    await ouvrirMontage(page, false);
    await page.waitForSelector('#mt-scene .repli-ios', { timeout: 8000 });
    ok((await page.locator('#mt-scene iframe').count()) === 0, 'iOS : AUCUNE iframe (elle ne lit rien en ligne)');
    ok((await page.locator('#mt-repli-tel').count()) === 1, 'iOS : bouton Télécharger présent');
    ok((await page.textContent('#mt-scene')).indexOf('indisponible') !== -1, 'iOS : message franc affiché');
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + (nFail ? '\x1b[31m' : '\x1b[32m') + nPass + ' PASS · ' + nFail + ' FAIL\x1b[0m');
  process.exit(nFail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
