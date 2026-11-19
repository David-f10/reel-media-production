'use strict';
// Banc NAVIGATEUR — l'écran montage sous « validation réservée » (mFinHtml, client.html). Sans vidéo (on attend
// #mt-fin, pas #mt-video). Prouve :
//   · peutValider:true  → le bouton « Valider cette version » est LÀ, note normale (deux actions) ;
//   · peutValider:false → le bouton DISPARAÎT (pas grisé), « Envoyer mes retours » reste, et la note est RÉÉCRITE
//     avec la phrase serveur « La validation revient à … » ;
//   · le câblage SURVIT au bouton absent (pas de TypeError : clic « Envoyer mes retours » répond encore).

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = path.resolve(__dirname, '..');

const MONTAGE = (peutValider, validationNote) => ({
  ok: true, titre: 'Montage de test', marque: 'Refashion',
  versions: [{ rang: 1, dateEnvoi: '2026-10-01', etat: 'a-relire' }],
  courante: { rang: 1 }, affichee: { rang: 1 },
  retours: [{ timecode: '0:01', texte: 'Un repère', categorie: '', mien: true, id: 'r1', brouillon: false }],
  peutValider: peutValider, validationNote: validationNote
});

function servirStatique() {
  const srv = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    const fichier = p === '/' || p === '/client.html' ? 'client.html' : p.replace(/^\//, '');
    const abs = path.join(RACINE, fichier);
    if (!abs.startsWith(RACINE) || !fs.existsSync(abs)) { res.writeHead(404); res.end('x'); return; }
    res.writeHead(200, { 'Content-Type': (abs.endsWith('.js') ? 'application/javascript' : 'text/html') + '; charset=utf-8' });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const nb = (p, s) => p.evaluate(x => document.querySelectorAll(x).length, s);

async function ouvrir(browser, port, peutValider, validationNote) {
  const ctx = await browser.newContext();
  await ctx.route('**/.netlify/functions/**', (route) => {
    const nom = new URL(route.request().url()).pathname.split('/').pop();
    if (nom === 'espace-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, projets: [] }) });
    if (nom === 'montage-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MONTAGE(peutValider, validationNote)) });
    if (nom === 'drive-stream-open') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false }) }); // repli : pas de vidéo
    if (nom === 'drive-view-client') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, fileId: 'FAKE' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('rmc-token', 'jeton.factice'); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} });
  await page.goto('http://127.0.0.1:' + port + '/client.html');
  await page.waitForTimeout(400);
  // Injecte une entrée montage dans #zone-projets (la délégation existante appelle ouvrirMontage).
  await page.evaluate(() => { var z = document.getElementById('zone-projets'); var b = document.createElement('button'); b.setAttribute('data-code', 'TESTCODE'); b.id = 'bench-go'; b.textContent = 'go'; z.appendChild(b); b.click(); });
  await page.waitForSelector('#mt-envoyer', { timeout: 8000 });
  return page;
}

(async () => {
  const { srv, port } = await servirStatique();
  const browser = await chromium.launch();
  try {
    console.log('\n\x1b[1mpeutValider:true → bouton « Valider » présent, note normale\x1b[0m');
    let p = await ouvrir(browser, port, true, '');
    ok('le bouton « Valider cette version » est présent', await nb(p, '#mt-valider') === 1);
    ok('« Envoyer mes retours » présent', await nb(p, '#mt-envoyer') === 1);
    ok('note normale (décrit les deux actions, « Valider clôt le film »)', await p.evaluate(() => /Valider clôt le film/.test(document.querySelector('.mt-fin-n').textContent)));
    await p.context().close();

    console.log('\n\x1b[1mpeutValider:false → bouton ABSENT, note réécrite avec la phrase serveur\x1b[0m');
    p = await ouvrir(browser, port, false, 'La validation revient à Alice Admin.');
    ok('⛔ le bouton « Valider cette version » est ABSENT (pas grisé)', await nb(p, '#mt-valider') === 0);
    ok('« Envoyer mes retours » reste présent', await nb(p, '#mt-envoyer') === 1);
    ok('la note NE parle plus de « Valider clôt le film »', await p.evaluate(() => !/Valider clôt le film/.test(document.querySelector('.mt-fin-n').textContent)));
    ok('la note porte la phrase serveur « La validation revient à Alice Admin. »', await p.evaluate(() => /La validation revient à Alice Admin\./.test(document.querySelector('.mt-fin-n').textContent)));
    // Le câblage survit au bouton absent : « Envoyer mes retours » répond encore (pas de TypeError sur $('mt-valider')).
    ok('le câblage survit : « Envoyer mes retours » est cliquable (pas de TypeError au rendu)', await p.evaluate(() => { var b = document.getElementById('mt-envoyer'); return !!b && typeof b.onclick !== 'undefined'; }));
    await p.context().close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await browser.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await browser.close(); process.exit(2); }
})();
