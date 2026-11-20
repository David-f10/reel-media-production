'use strict';
// Banc NAVIGATEUR — le CADRE réservé (lot orientation). ⛔ On ne vérifie PAS la classe : on MESURE la boîte rendue
// (getBoundingClientRect) AVANT que la vidéo charge, et on vérifie le RAPPORT en pixels. Le flux est volontairement
// laissé en attente (drive-stream ne répond jamais) → le <video> reste readyState 0, la boîte n'a que le ratio CSS.
//   portrait → ~9/16 (0.5625) ;  paysage → ~16/9 (1.777).
// Mordant (voir le rapport) : retirer l'aspect-ratio du CSS → la boîte redevient plate (~300×150, ratio ~2) → tombe.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = path.resolve(__dirname, '..');

const MONTAGE = (orientation) => ({
  ok: true, titre: 'Montage', marque: 'Refashion',
  versions: [{ rang: 1, dateEnvoi: '2026-10-01', etat: 'a-relire' }],
  courante: { rang: 1 }, affichee: { rang: 1 }, retours: [],
  peutValider: true, validationNote: '', orientation: orientation
});

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

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

// Monte le montage, laisse le flux EN ATTENTE, mesure le ratio de #mt-video + son readyState.
async function mesurer(browser, port, orientation, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1100, height: 900 } });
  await ctx.route('**/.netlify/functions/**', (route) => {
    const nom = new URL(route.request().url()).pathname.split('/').pop();
    if (nom === 'espace-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, projets: [] }) });
    if (nom === 'montage-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MONTAGE(orientation)) });
    if (nom === 'drive-stream-open') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Set-Cookie': 'rmv=t; Path=/' }, body: JSON.stringify({ ok: true, expiresDansSec: 7200 }) });
    if (nom === 'drive-stream') return; // ⛔ jamais fulfilli → le <video> reste en attente (readyState 0)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('rmc-token', 'jeton.factice'); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} });
  await page.goto('http://127.0.0.1:' + port + '/client.html');
  await page.waitForTimeout(400);
  await page.evaluate(() => { var z = document.getElementById('zone-projets'); var b = document.createElement('button'); b.setAttribute('data-code', 'TESTCODE'); b.id = 'go'; z.appendChild(b); b.click(); });
  await page.waitForSelector('#mt-video', { timeout: 8000 });
  await page.waitForTimeout(250); // laisse le layout se poser, PAS la vidéo (qui n'arrive jamais)
  const m = await page.evaluate(() => { var v = document.getElementById('mt-video'); var r = v.getBoundingClientRect(); return { w: r.width, h: r.height, ratio: r.height ? r.width / r.height : 0, rs: v.readyState }; });
  return { page, ctx, m };
}

// Les DEUX largeurs : bureau ET téléphone (390×844). 45 films sur 46 sont verticaux → regardés au téléphone ;
// c'est la largeur qui compte le plus, et sous la media query 620px (:400) le CSS portrait change — on le fige.
const LARGEURS = [
  { nom: 'bureau (1100)', vp: { width: 1100, height: 900 } },
  { nom: 'téléphone (390)', vp: { width: 390, height: 844 } }
];

(async () => {
  const { srv, port } = await servirStatique();
  const browser = await chromium.launch();
  try {
    for (const L of LARGEURS) {
      console.log('\n\x1b[1m' + L.nom + ' — portrait 9:16 / paysage 16:9 réservés AVANT la vidéo (pixels)\x1b[0m');
      let { ctx, m } = await mesurer(browser, port, 'portrait', L.vp);
      ok('[' + L.nom + '] portrait : readyState 0 (mesuré AVANT la vidéo)', m.rs === 0);
      ok('[' + L.nom + '] portrait : boîte non plate (hauteur > largeur)', m.h > m.w && m.w > 0);
      ok('[' + L.nom + '] portrait : ratio ≈ 9/16 (0.50–0.65) : ' + m.ratio.toFixed(3), m.ratio > 0.50 && m.ratio < 0.65);
      await ctx.close();

      ({ ctx, m } = await mesurer(browser, port, 'paysage', L.vp));
      ok('[' + L.nom + '] paysage : readyState 0', m.rs === 0);
      ok('[' + L.nom + '] paysage : boîte non plate (largeur > hauteur)', m.w > m.h && m.h > 0);
      ok('[' + L.nom + '] paysage : ratio ≈ 16/9 (1.70–1.85) : ' + m.ratio.toFixed(3), m.ratio > 1.70 && m.ratio < 1.85);
      await ctx.close();
    }

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await browser.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await browser.close(); process.exit(2); }
})();
