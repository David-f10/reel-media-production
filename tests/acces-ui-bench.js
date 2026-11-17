'use strict';
// Banc NAVIGATEUR — « Qui a accès » (client.html).
//  (d) « Changer mon code » est DANS l'écran « Qui a accès », ABSENT de la barre du haut (il a déménagé) ;
//  (e) en mode emprunt (ro), le lien est MASQUÉ, mais la LISTE reste visible ;
//  + la liste rend bien les personnes avec leur pastille d'état.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const EXP = Math.floor(Date.now() / 1000) + 99999;
const TOK = b64u({ id: '0'.repeat(32), exp: EXP }) + '.sig';
const TOK_RO = b64u({ id: '0'.repeat(32), exp: EXP, ro: 1, acteur: 'chef' }) + '.sig';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const ACCES = { ok: true, acces: [
  { nom: 'Claire', mail: 'claire@refashion.fr', actif: true, aCode: true },   // Actif
  { nom: 'Marc', mail: 'marc@refashion.fr', actif: true, aCode: false },       // En attente
  { nom: 'Sofia', mail: 'sofia@refashion.fr', actif: false, aCode: true }      // Sans accès
] };

function serveur() {
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = ''; req.on('data', c => body += c);
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        if (u.endsWith('espace-client')) return res.end(JSON.stringify(ESPACE));
        if (u.endsWith('acces-client')) return res.end(JSON.stringify(ACCES));
        if (u.endsWith('mission-client')) return res.end(JSON.stringify({ ok: true, missions: [] }));
        if (u.endsWith('demande-client')) return res.end(JSON.stringify({ ok: true, demandes: [] }));
        return res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    const f = path.join(process.cwd(), u === '/' ? '/client.html' : u);
    fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end('x'); } res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(d); });
  });
}

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const nb = (p, s) => p.evaluate(x => document.querySelectorAll(x).length, s);

async function ouvrir(b, token, URL) {
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); localStorage.setItem('rmc-codebrand', 'B33'); } catch (e) {} }, token);
  await p.goto(URL); await p.waitForTimeout(500);
  await p.click('#nv-acces'); await p.waitForTimeout(400);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const URL = 'http://localhost:' + port + '/client.html';
  try {
    console.log('\n\x1b[1m(d) « Changer mon code » dans l\'écran, absent de la barre du haut\x1b[0m');
    let p = await ouvrir(b, TOK, URL);
    ok('l\'écran « Qui a accès » est affiché', await p.evaluate(() => !document.getElementById('panneau-acces').classList.contains('hidden')));
    ok('la liste rend les 3 personnes', await nb(p, '#acc-liste .acc-pers') === 3);
    ok('les 3 états en pastille (vert Actif, ambre/base En attente, gris Sans accès)', await p.evaluate(() => {
      var t = document.getElementById('acc-liste').innerText;
      return /Actif/.test(t) && /En attente/.test(t) && /Sans accès/.test(t);
    }) && await nb(p, '#acc-liste .pill.vert') === 1 && await nb(p, '#acc-liste .pill.gris') === 1);
    ok('⛔ « Changer mon code » n\'est PAS dans la barre du haut', await p.evaluate(() => { var tb = document.querySelector('.topbar .id'); return !!tb && tb.innerText.indexOf('Changer mon code') === -1; }));
    ok('« Changer mon code » EST dans l\'écran « Qui a accès »', await p.evaluate(() => !!document.querySelector('#panneau-acces #lien-code')));
    ok('le lien ouvre l\'écran de changement', await (async () => { await p.click('#panneau-acces #lien-code'); await p.waitForTimeout(200); return p.evaluate(() => !document.getElementById('vue-code').classList.contains('hidden')); })());
    await p.close();

    console.log('\n\x1b[1m(e) mode emprunt (ro) : lien masqué, liste visible\x1b[0m');
    p = await ouvrir(b, TOK_RO, URL);
    ok('la LISTE reste visible en ro', await nb(p, '#acc-liste .acc-pers') === 3);
    ok('⛔ « Changer mon code » est MASQUÉ en ro (pas affiché-puis-refusé)', await nb(p, '#panneau-acces #lien-code') === 0);
    await p.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
