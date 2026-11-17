'use strict';
// Banc NAVIGATEUR — « Changer mon code » devient VOLONTAIRE (plus de forçage au login). client.html.
//  ⛔ LE CRITIQUE : un login avec un code de 3 car. entre DIRECTEMENT dans l'espace — aucun écran, aucune redirection ;
//  · le lien « Changer mon code » (barre du haut) ouvre l'écran ; suggestion pré-remplie (préfixe + 7) ;
//  · Valider envoie {oldCode = code actuel saisi, newCode} à code-client ; succès → retour à l'espace ;
//  · ancien code faux (401) → message « Code actuel incorrect », on reste sur l'écran ;
//  · Annuler → retour à l'espace, aucun POST ;
//  · crypto indisponible → suggestion VIDE (échec fermé) ;
//  · ⛔ aucun code en localStorage (ni l'actuel saisi, ni la suggestion).

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const CODE_ACTUEL = 'ABC';

let changeBodies = [];
function serveur() {
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = ''; req.on('data', c => body += c);
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
        if (u.endsWith('login-client')) return res.end(JSON.stringify({ ok: true, token: 'jeton-factice.sig', nom: 'Claire', marque: 'Refashion', codeBrand: 'B33' })); // ⛔ plus de codeCourt
        if (u.endsWith('code-client')) { changeBodies.push(b); if (b.oldCode !== CODE_ACTUEL) { res.statusCode = 401; return res.end(JSON.stringify({ ok: false, error: 'Code actuel incorrect' })); } return res.end(JSON.stringify({ ok: true })); }
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
const SUGG = /^B33-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/;
async function login(p, code) { await p.fill('#in-mail', 'c@refashion.fr'); await p.fill('#in-code', code); await p.click('#btn-login'); await p.waitForTimeout(400); }

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const URL = 'http://localhost:' + port + '/client.html';
  try {
    let p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    await p.goto(URL); await p.waitForTimeout(300);
    changeBodies = [];

    console.log('\n\x1b[1m⛔ LE CRITIQUE — login code court → DIRECT dans l\'espace\x1b[0m');
    await login(p, CODE_ACTUEL); // 3 caractères
    ok('l\'espace s\'affiche directement', await visible(p, 'vue-accueil'));
    ok('⛔ AUCUN écran de changement (vue-code masquée)', !(await visible(p, 'vue-code')));
    ok('⛔ aucune redirection, aucun POST code-client', changeBodies.length === 0);

    console.log('\n\x1b[1mLe lien « Changer mon code » (volontaire) ouvre l\'écran\x1b[0m');
    await p.click('#lien-code'); await p.waitForTimeout(250);
    ok('vue-code affichée, espace masqué', await visible(p, 'vue-code') && !(await visible(p, 'vue-accueil')));
    ok('suggestion pré-remplie (B33 + 7)', SUGG.test(await p.inputValue('#cc-code')));
    ok('le champ « Code actuel » est vide', (await p.inputValue('#cc-actuel')) === '');

    console.log('\n\x1b[1mValider → POST code-client, retour à l\'espace\x1b[0m');
    const sugg = await p.inputValue('#cc-code');
    await p.fill('#cc-actuel', CODE_ACTUEL);
    await p.click('#cc-valider'); await p.waitForTimeout(400);
    ok('POST code-client : oldCode = code actuel saisi, newCode = suggestion', changeBodies.length === 1 && changeBodies[0].oldCode === CODE_ACTUEL && changeBodies[0].newCode === sugg);
    ok('succès → retour à l\'espace', await visible(p, 'vue-accueil'));
    const ls = await p.evaluate(() => { var o = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
    ok('⛔ aucun code en localStorage (ni l\'actuel, ni la suggestion, ni rmc-code)', !('rmc-code' in ls) && JSON.stringify(ls).indexOf(CODE_ACTUEL) === -1 && JSON.stringify(ls).indexOf(sugg) === -1);
    ok('codeBrand (non secret) est stocké pour la suggestion', ls['rmc-codebrand'] === 'B33');

    console.log('\n\x1b[1mAncien code faux → 401 propre, on reste sur l\'écran\x1b[0m');
    changeBodies = [];
    await p.click('#lien-code'); await p.waitForTimeout(200);
    await p.fill('#cc-actuel', 'MAUVAIS'); await p.click('#cc-valider'); await p.waitForTimeout(400);
    ok('message « Code actuel incorrect »', /code actuel incorrect/i.test(await p.evaluate(() => document.getElementById('cc-msg').innerText)));
    ok('on reste sur l\'écran de changement', await visible(p, 'vue-code'));

    console.log('\n\x1b[1mAnnuler → retour à l\'espace, aucun POST\x1b[0m');
    changeBodies = [];
    await p.fill('#cc-actuel', 'PEU-IMPORTE'); await p.click('#cc-annuler'); await p.waitForTimeout(250);
    ok('retour à l\'espace', await visible(p, 'vue-accueil'));
    ok('aucun POST', changeBodies.length === 0);
    await p.close();

    console.log('\n\x1b[1mcrypto indisponible → suggestion VIDE (échec fermé)\x1b[0m');
    p = await b.newPage({ viewport: { width: 1100, height: 900 } });
    await p.addInitScript(() => { try { Object.defineProperty(window, 'crypto', { configurable: true, get: function () { return undefined; } }); } catch (e) {} });
    await p.goto(URL); await p.waitForTimeout(300);
    await login(p, CODE_ACTUEL);
    await p.click('#lien-code'); await p.waitForTimeout(200);
    ok('⛔ pas de CSPRNG → le champ nouveau code reste VIDE', (await p.inputValue('#cc-code')) === '');
    await p.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
