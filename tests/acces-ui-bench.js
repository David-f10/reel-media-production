'use strict';
// Banc NAVIGATEUR — « Qui a accès » (client.html). Le serveur est SIMULÉ : sa logique (moi vrai sur une seule
// ligne, moi faux partout en ro) est prouvée dans acces-bench.js (node). Ici on prouve le RENDU client :
//  (b) la ligne de l'appelant (moi:true) est marquée .moi + « Vous », une seule fois ; l'inactif porte .off ;
//  (d) « Changer mon code » est DANS la ligne .moi de l'écran, ABSENT de la barre du haut (il a déménagé) ;
//  (e) en emprunt (ro, moi:false partout), le lien est MASQUÉ et aucun « Vous » n'apparaît, mais la LISTE reste ;
//  (f) « Déconnexion » : EXACTEMENT une joignable à CHAQUE point de rupture (desktop → le rail ; <860px → l'en-tête,
//      le rail masquant alors sa propre déco) — le doublon de la barre du haut retiré, SANS cul-de-sac mobile ;
//  (g) ⛔ LE CRITIQUE : après retrait de l'élément #lien-deco ET de son handler non gardé, une destination du rail
//      (câblée APRÈS la ligne retirée) répond toujours — preuve qu'aucun TypeError n'a tué le câblage du dessous.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const EXP = Math.floor(Date.now() / 1000) + 99999;
const TOK = b64u({ id: '0'.repeat(32), exp: EXP }) + '.sig';
const TOK_RO = b64u({ id: '0'.repeat(32), exp: EXP, ro: 1, acteur: 'chef' }) + '.sig';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const PERS = [
  { nom: 'Claire', mail: 'claire@refashion.fr', actif: true, aCode: true },   // Actif — l'appelant
  { nom: 'Marc', mail: 'marc@refashion.fr', actif: true, aCode: false },       // En attente
  { nom: 'Sofia', mail: 'sofia@refashion.fr', actif: false, aCode: true }      // Sans accès (inactif → .off)
];
// Comme le vrai serveur : hors ro, l'appelant (Claire, index 0) est marqué moi:true ; en ro, moi:false PARTOUT.
const accesPour = (ro) => ({ ok: true, acces: PERS.map((x, i) => Object.assign({ moi: !ro && i === 0 }, x)) });

function serveur() {
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = ''; req.on('data', c => body += c);
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        if (u.endsWith('espace-client')) return res.end(JSON.stringify(ESPACE));
        if (u.endsWith('acces-client')) return res.end(JSON.stringify(accesPour((req.headers['x-rmc-token'] || '') === TOK_RO)));
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
const vis = (p, id) => p.evaluate(x => { var e = document.getElementById(x); return !!e && !e.classList.contains('hidden'); }, id);
// Nombre de contrôles « Déconnexion » RÉELLEMENT rendus (feuille au texte exact, getClientRects robuste au position:fixed
// du rail). mt-deco dit « Se déconnecter » → jamais compté. Hors-écran (display:none, vue masquée) → non rendu → 0.
const decoVisibles = (p) => p.evaluate(() => [].slice.call(document.querySelectorAll('*'))
  .filter(function (e) { return e.children.length === 0 && e.textContent.trim() === 'Déconnexion' && e.getClientRects().length > 0; }).length);

async function ouvrir(b, token, URL) {
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); localStorage.setItem('rmc-codebrand', 'B33'); } catch (e) {} }, token);
  await p.goto(URL); await p.waitForTimeout(500);
  return p;
}
async function ouvrirAcces(b, token, URL) {
  const p = await ouvrir(b, token, URL);
  await p.click('#nv-acces'); await p.waitForTimeout(400);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const URL = 'http://localhost:' + port + '/client.html';
  try {
    console.log('\n\x1b[1m(b)(d) liste en cartes, marquage « moi », lien dans la ligne de l\'appelant\x1b[0m');
    let p = await ouvrirAcces(b, TOK, URL);
    ok('l\'écran « Qui a accès » est affiché', await vis(p, 'panneau-acces'));
    ok('la liste rend les 3 personnes', await nb(p, '#acc-liste .acc-pers') === 3);
    ok('les 3 états en pastille (vert Actif, ambre/base En attente, gris Sans accès)', await p.evaluate(() => {
      var t = document.getElementById('acc-liste').innerText;
      return /Actif/.test(t) && /En attente/.test(t) && /Sans accès/.test(t);
    }) && await nb(p, '#acc-liste .pill.vert') === 1 && await nb(p, '#acc-liste .pill.gris') === 1);
    ok('(b) marquage .moi sur EXACTEMENT une ligne', await nb(p, '#acc-liste .acc-pers.moi') === 1);
    ok('la ligne .moi porte « Vous »', await p.evaluate(() => { var r = document.querySelector('#acc-liste .acc-pers.moi'); return !!r && /vous/i.test(r.textContent); }));
    ok('« Vous » n\'apparaît que sur cette ligne', await nb(p, '#acc-liste .vous') === 1);
    ok('l\'inactif (Sofia) porte .off', await p.evaluate(() => { return [].slice.call(document.querySelectorAll('#acc-liste .acc-pers')).some(function (r) { return /Sofia/.test(r.innerText) && r.classList.contains('off'); }); }));
    ok('⛔ « Changer mon code » n\'est PAS dans la barre du haut', await p.evaluate(() => { var tb = document.querySelector('.topbar .id'); return !!tb && tb.innerText.indexOf('Changer mon code') === -1; }));
    ok('(d) « Changer mon code » est DANS la ligne .moi de l\'écran', await p.evaluate(() => !!document.querySelector('#panneau-acces .acc-pers.moi #lien-code')));
    ok('le lien ouvre l\'écran de changement', await (async () => { await p.click('#panneau-acces #lien-code'); await p.waitForTimeout(200); return vis(p, 'vue-code'); })());
    await p.close();

    console.log('\n\x1b[1m(e) emprunt (ro) : lien masqué, aucun « Vous », liste visible\x1b[0m');
    p = await ouvrirAcces(b, TOK_RO, URL);
    ok('la LISTE reste visible en ro', await nb(p, '#acc-liste .acc-pers') === 3);
    ok('⛔ « Changer mon code » est MASQUÉ en ro (pas affiché-puis-refusé)', await nb(p, '#panneau-acces #lien-code') === 0);
    ok('⛔ aucun marquage « Vous » en ro (serveur : moi false partout)', await nb(p, '#acc-liste .vous') === 0);
    ok('⛔ aucune ligne .moi en ro', await nb(p, '#acc-liste .acc-pers.moi') === 0);
    await p.close();

    console.log('\n\x1b[1m(f) une seule « Déconnexion » joignable À CHAQUE point de rupture\x1b[0m');
    p = await ouvrir(b, TOK, URL); // desktop 1100
    ok('⛔ aucune « Déconnexion » dans la barre du haut (#lien-deco retiré)', await nb(p, '.topbar #lien-deco') === 0);
    ok('(f-desktop) EXACTEMENT une déconnexion visible (le rail)', await decoVisibles(p) === 1);

    console.log('\n\x1b[1m(g) ⛔ LE CRITIQUE — le câblage du rail survit au retrait du handler non gardé\x1b[0m');
    // #nv-films est câblé APRÈS la ligne $(\'lien-deco\')... retirée. Si cette ligne était restée sur un élément
    // absent, un TypeError au chargement aurait tué ce câblage → ce clic ne ferait rien.
    await p.click('#nv-films'); await p.waitForTimeout(300);
    ok('(g) un clic sur une destination du rail ouvre son panneau', await vis(p, 'panneau-films'));
    ok('(g) et referme « Qui a accès »', !(await vis(p, 'panneau-acces')));

    console.log('\n\x1b[1m(f) bascule <860px : le rail masque sa déco, l\'en-tête prend le relais\x1b[0m');
    await p.setViewportSize({ width: 500, height: 900 }); await p.waitForTimeout(250);
    ok('(f-mobile) EXACTEMENT une déconnexion visible (<860px)', await decoVisibles(p) === 1);
    ok('(f-mobile) et c\'est l\'en-tête (#deco-mob), PAS le rail', await p.evaluate(() => {
      var d = document.getElementById('deco-mob'), r = document.querySelector('#rail-deco .nv-lb');
      return !!d && d.getClientRects().length > 0 && (!r || r.getClientRects().length === 0);
    }));
    await p.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
