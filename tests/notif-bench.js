'use strict';
// Banc NAVIGATEUR — PR-3 « non lu » : point rouge sur la ligne + pastille du rail. 100% client, zéro requête.
//  · demande avec réponse jamais ouverte → point rouge ET pastille à 1 ;
//  · on ouvre le fil → le point disparaît, la pastille retombe à 0 ;
//  · l'équipe répond À NOUVEAU (texte différent) → non lu revient ;
//  · le CLIENT écrit après avoir lu (reponse inchangée) → reste LU (pas de faux positif) ;
//  · une demande sans réponse → jamais de point ;
//  · ⛔ localStorage « vu » indisponible (exception) → l'écran se rend, rien ne plante ;
//  · la pastille du rail est juste MÊME sur « Mes films ».

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = b64u({ id: '0'.repeat(32), exp: Math.floor(Date.now() / 1000) + 99999 }) + '.sig';
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const TYPES = { '.html': 'text/html' };
const ID1 = 'aaaa0000000000000000000000000001', ID2 = 'aaaa0000000000000000000000000002';

// État serveur MUTABLE : on change D1.reponse entre deux rechargements pour simuler une nouvelle réponse équipe.
const S = { rep1: 'Réponse A' };
function demandes() {
  return [
    { id: ID1, ref: 'D-B33-01', message: 'Avec réponse', type: 'Autre', statut: 'En cours', reponse: S.rep1, traitePar: '', codeCarte: '', date: '2026-11-14T09:00:00Z' },
    { id: ID2, ref: 'D-B33-02', message: 'Sans réponse', type: 'Autre', statut: 'Nouvelle', reponse: '', traitePar: '', codeCarte: '', date: '2026-11-13T09:00:00Z' }
  ];
}
function serveur() {
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = ''; req.on('data', c => body += c);
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        if (u.endsWith('espace-client')) return res.end(JSON.stringify(ESPACE));
        if (u.endsWith('mission-client')) return res.end(JSON.stringify({ ok: true, missions: [] }));
        if (u.endsWith('demande-client')) {
          let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
          if (b.action === 'mes') return res.end(JSON.stringify({ ok: true, demandes: demandes() }));
          if (b.action === 'fil') { const d = demandes().find(x => x.id === b.demandeId) || {}; return res.end(JSON.stringify({ ok: true, statut: 'En cours', fil: [{ sens: 'Client', auteur: 'Vous', texte: d.message || '', date: d.date, modifieLe: '', mien: true, initial: true }].concat(d.reponse ? [{ sens: 'Réel Média', auteur: 'Réel Média', texte: d.reponse, date: '2026-11-15T09:00:00Z', modifieLe: '', mien: false }] : []), delai: { enAttente: false, depuis: '' } })); }
          return res.end(JSON.stringify({ ok: true }));
        }
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
const railTxt = (p) => p.evaluate(() => { const e = document.getElementById('rail-badge-demandes'); return e ? { t: e.textContent, hidden: e.classList.contains('hidden') } : null; });
const nbDot = (p, idx) => p.evaluate(i => document.querySelectorAll('#md-liste .md-item[data-idx="' + i + '"] .neuf').length, idx);

async function page(b, ctx, bloquerVus) {
  const p = await ctx.newPage();
  await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} }, TOKEN);
  if (bloquerVus) await p.addInitScript(() => {
    const g = Storage.prototype.getItem, s = Storage.prototype.setItem; // SEULE la clé « vu » casse (le jeton reste lisible)
    Storage.prototype.getItem = function (k) { if (k === 'rmc-dem-vus') throw new Error('bloqué'); return g.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k === 'rmc-dem-vus') throw new Error('bloqué'); return s.call(this, k, v); };
  });
  return p;
}
const allerDemandes = async (p) => { await p.click('#nv-demandes'); await p.waitForTimeout(450); };

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const URL = 'http://localhost:' + port + '/client.html';
  try {
    const ctx = await b.newContext();
    S.rep1 = 'Réponse A';
    let p = await page(b, ctx, false);
    await p.goto(URL); await p.waitForTimeout(700); // atterrit sur « Mes films »

    console.log('\n\x1b[1mPastille rail juste MÊME sur « Mes films »\x1b[0m');
    let rb = await railTxt(p);
    ok('sur « Mes films », la pastille rail « Mes demandes » = 1 (une réponse non lue), visible', rb && rb.t === '1' && rb.hidden === false);

    console.log('\n\x1b[1mPoint rouge : réponse jamais ouverte\x1b[0m');
    await allerDemandes(p);
    ok('D1 (avec réponse, jamais ouverte) → point rouge', await nbDot(p, 0) === 1);
    ok('D2 (sans réponse) → AUCUN point', await nbDot(p, 1) === 0);

    console.log('\n\x1b[1mOuvrir le fil → point disparaît, pastille à 0\x1b[0m');
    await p.locator('#md-liste .md-item').nth(0).click(); await p.waitForTimeout(450);
    ok('après ouverture : le point de D1 a disparu', await nbDot(p, 0) === 0);
    rb = await railTxt(p);
    ok('après ouverture : la pastille rail est retombée à 0 (masquée)', rb && rb.hidden === true);
    await p.close();

    console.log('\n\x1b[1mL\'équipe répond À NOUVEAU (texte différent) → non lu revient\x1b[0m');
    S.rep1 = 'Réponse B DIFFÉRENTE'; // nouvelle réponse équipe → empreinte différente
    p = await page(b, ctx, false); await p.goto(URL); await p.waitForTimeout(700);
    rb = await railTxt(p);
    ok('nouvelle réponse → pastille rail = 1 de nouveau', rb && rb.t === '1' && rb.hidden === false);
    await allerDemandes(p);
    ok('nouvelle réponse → le point rouge de D1 revient', await nbDot(p, 0) === 1);

    console.log('\n\x1b[1mLe CLIENT écrit après avoir lu (reponse inchangée) → reste LU\x1b[0m');
    await p.locator('#md-liste .md-item').nth(0).click(); await p.waitForTimeout(400); // lit B
    await p.close();
    p = await page(b, ctx, false); await p.goto(URL); await p.waitForTimeout(700); // reponse TOUJOURS B (le client écrire ne la change pas)
    rb = await railTxt(p);
    ok('reponse inchangée après lecture → reste LU (pastille masquée, pas de faux positif)', rb && rb.hidden === true);
    await allerDemandes(p);
    ok('reponse inchangée → aucun point rouge', await nbDot(p, 0) === 0);
    await p.close();

    console.log('\n\x1b[1m⛔ localStorage « vu » indisponible → rien ne plante\x1b[0m');
    const ctx2 = await b.newContext();
    S.rep1 = 'Réponse A';
    p = await page(b, ctx2, true); // la clé « vu » jette à chaque accès
    await p.goto(URL); await p.waitForTimeout(700);
    ok('storage « vu » cassé : l\'écran se rend quand même (rail visible)', await p.evaluate(() => !!document.getElementById('nv-demandes')));
    await allerDemandes(p);
    ok('storage « vu » cassé : la liste des demandes se rend', await p.evaluate(() => document.querySelectorAll('#md-liste .md-item').length) === 2);
    ok('storage « vu » cassé : tout apparaît NON LU (dégradation assumée), pas de crash', await nbDot(p, 0) === 1);
    await p.locator('#md-liste .md-item').nth(0).click(); await p.waitForTimeout(400);
    ok('storage « vu » cassé : ouvrir un fil ne plante pas (le point s\'enlève en DOM)', await nbDot(p, 0) === 0);
    await p.close(); await ctx2.close(); await ctx.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
