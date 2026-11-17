'use strict';
// Banc NAVIGATEUR — PR-2 : le flux « code trop court » forcé au login (client.html).
//  · login code court → écran forcé (pas l'espace) ; suggestion pré-remplie au bon format (préfixe + 7) ;
//  · « Proposer un autre » régénère ; « Valider » envoie {oldCode = code tapé, newCode = suggestion} à code-client ;
//  · succès → l'espace s'affiche ;
//  · ⛔ ni l'ancien ni le nouveau code ne sont stockés dans localStorage (seul le jeton) ;
//  · login code long → direct à l'espace (pas d'écran forcé) ;
//  · un nouveau code trop court tapé → erreur CLIENT, aucun POST.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };

let changeBodies = [];
function serveur() {
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = ''; req.on('data', c => body += c);
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
        if (u.endsWith('login-client')) { const court = String(b.code || '').length < 8; return res.end(JSON.stringify({ ok: true, token: 'jeton-factice.sig', nom: 'Claire', marque: 'Refashion', codeBrand: 'B33', codeCourt: court })); }
        if (u.endsWith('code-client')) { changeBodies.push(b); return res.end(JSON.stringify({ ok: true })); }
        if (u.endsWith('espace-client')) return res.end(JSON.stringify(ESPACE));
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
const visible = (p, id) => p.evaluate(x => { var e = document.getElementById(x); return !!e && !e.classList.contains('hidden'); }, id);

async function login(p, code) {
  await p.fill('#in-mail', 'c@refashion.fr');
  await p.fill('#in-code', code);
  await p.click('#btn-login'); await p.waitForTimeout(400);
}

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const URL = 'http://localhost:' + port + '/client.html';
  try {
    // ── code court → écran forcé ──
    let p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    await p.goto(URL); await p.waitForTimeout(300);
    changeBodies = [];
    await login(p, 'ABC'); // code court
    console.log('\n\x1b[1mLogin code court → écran forcé\x1b[0m');
    ok('l\'écran « choisissez un nouveau code » est affiché', await visible(p, 'vue-codecourt'));
    ok('l\'espace n\'est PAS affiché', !(await visible(p, 'vue-accueil')));
    const sugg = await p.inputValue('#cc-code');
    ok('suggestion pré-remplie au format préfixe-7 (B33-XXXXXXX, alphabet non ambigu)', /^B33-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/.test(sugg));
    await p.click('#cc-autre'); await p.waitForTimeout(100);
    const sugg2 = await p.inputValue('#cc-code');
    ok('« Proposer un autre » régénère une suggestion valide', /^B33-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/.test(sugg2));

    console.log('\n\x1b[1mValider → POST code-client, puis l\'espace\x1b[0m');
    await p.click('#cc-valider'); await p.waitForTimeout(500);
    ok('un POST code-client est parti', changeBodies.length === 1);
    ok('oldCode = le code tapé au login (« ABC »)', changeBodies[0] && changeBodies[0].oldCode === 'ABC');
    ok('newCode = la suggestion affichée', changeBodies[0] && changeBodies[0].newCode === sugg2);
    ok('après succès → l\'espace s\'affiche', await visible(p, 'vue-accueil'));
    const ls = await p.evaluate(() => { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
    ok('⛔ localStorage : le jeton est là', ls['rmc-token'] === 'jeton-factice.sig');
    ok('⛔ localStorage : AUCUN code stocké (ni rmc-code, ni « ABC », ni la suggestion)', !('rmc-code' in ls) && JSON.stringify(ls).indexOf('ABC') === -1 && JSON.stringify(ls).indexOf(sugg2) === -1);
    await p.close();

    // ── code long → direct à l'espace ──
    console.log('\n\x1b[1mLogin code long → pas d\'écran forcé\x1b[0m');
    p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    await p.goto(URL); await p.waitForTimeout(300);
    changeBodies = [];
    await login(p, 'ABCDEFGHIJ'); // code long
    ok('l\'espace s\'affiche directement', await visible(p, 'vue-accueil'));
    ok('l\'écran forcé n\'apparaît pas', !(await visible(p, 'vue-codecourt')));
    ok('aucun POST code-client', changeBodies.length === 0);
    await p.close();

    // ── validation client : nouveau code trop court ──
    console.log('\n\x1b[1mNouveau code trop court tapé → erreur client, aucun POST\x1b[0m');
    p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    await p.goto(URL); await p.waitForTimeout(300);
    changeBodies = [];
    await login(p, 'ABC');
    await p.fill('#cc-code', 'AB'); // trop court
    await p.click('#cc-valider'); await p.waitForTimeout(250);
    ok('message d\'erreur « au moins 8 »', /8 caractères/i.test(await p.evaluate(() => document.getElementById('cc-msg').innerText)));
    ok('aucun POST code-client', changeBodies.length === 0);
    await p.close();

    // ── crypto indisponible → ÉCHEC FERMÉ : aucune suggestion, aucun code fabriqué ──
    console.log('\n\x1b[1mcrypto indisponible → aucune suggestion fabriquée\x1b[0m');
    p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    await p.addInitScript(() => { try { Object.defineProperty(window, 'crypto', { configurable: true, get: function () { return undefined; } }); } catch (e) {} });
    await p.goto(URL); await p.waitForTimeout(300);
    changeBodies = [];
    await login(p, 'ABC');
    ok('écran forcé affiché', await visible(p, 'vue-codecourt'));
    ok('⛔ pas de CSPRNG → le champ reste VIDE (aucune suggestion fabriquée)', (await p.inputValue('#cc-code')) === '');
    await p.click('#cc-autre'); await p.waitForTimeout(100);
    ok('⛔ « Proposer un autre » ne fabrique rien non plus (champ vide)', (await p.inputValue('#cc-code')) === '');
    await p.click('#cc-valider'); await p.waitForTimeout(200);
    ok('valider sur champ vide → erreur client, aucun POST (aucun code fabriqué)', changeBodies.length === 0);
    await p.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
