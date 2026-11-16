'use strict';
// Banc NAVIGATEUR — PR-3 « non lu » : point rouge + pastille rail. 100% client, zéro requête.
// Marquage « vu » : au CLIC (règle de base) ET à la navigation vers « Mes demandes » SI le détail est
// réellement visible (desktop) — jamais à l'auto-sélection du chargement (sinon, sur « Mes films », une
// réponse jamais vue disparaîtrait). Vérifie aussi : équipe re-répond → non lu revient ; client écrit →
// reste lu ; sans réponse → jamais de point ; ⛔ storage « vu » cassé → rien ne plante ; pastille sur « Mes films ».

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = b64u({ id: '0'.repeat(32), exp: Math.floor(Date.now() / 1000) + 99999 }) + '.sig';
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const TYPES = { '.html': 'text/html' };
const ID1 = 'aaaa0000000000000000000000000001', ID2 = 'aaaa0000000000000000000000000002', ID3 = 'aaaa0000000000000000000000000003';
const S = { repA: 'Réponse A' }; // D1 muté entre rechargements ; D3 fixe ; D2 sans réponse

function demandes() {
  return [
    { id: ID1, ref: 'D-B33-01', message: 'Avec réponse (auto-sélectionnée)', type: 'Autre', statut: 'En cours', reponse: S.repA, traitePar: '', codeCarte: '', date: '2026-11-14T09:00:00Z' },
    { id: ID2, ref: 'D-B33-02', message: 'Sans réponse', type: 'Autre', statut: 'Nouvelle', reponse: '', traitePar: '', codeCarte: '', date: '2026-11-13T09:00:00Z' },
    { id: ID3, ref: 'D-B33-03', message: 'Avec réponse (plus bas)', type: 'Autre', statut: 'En cours', reponse: 'Réponse C', traitePar: '', codeCarte: '', date: '2026-11-12T09:00:00Z' }
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
const rail = (p) => p.evaluate(() => { const e = document.getElementById('rail-badge-demandes'); return e ? { t: e.textContent, hidden: e.classList.contains('hidden') } : null; });
const dot = (p, i) => p.evaluate(x => document.querySelectorAll('#md-liste .md-item[data-idx="' + x + '"] .neuf').length, i);

async function newp(ctx, bloquerVus) {
  const p = await ctx.newPage();
  await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} }, TOKEN);
  if (bloquerVus) await p.addInitScript(() => {
    const g = Storage.prototype.getItem, s = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { if (k === 'rmc-dem-vus') throw new Error('bloqué'); return g.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k === 'rmc-dem-vus') throw new Error('bloqué'); return s.call(this, k, v); };
  });
  return p;
}

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const URL = 'http://localhost:' + port + '/client.html';
  const nav = async (p) => { await p.click('#nv-demandes'); await p.waitForTimeout(450); };
  try {
    // ── DESKTOP ──────────────────────────────────────────────────────────────────────────────────────
    const ctxD = await b.newContext({ viewport: { width: 1280, height: 900 } });
    S.repA = 'Réponse A';
    let p = await newp(ctxD, false);
    await p.goto(URL); await p.waitForTimeout(700); // atterrit sur « Mes films »

    console.log('\n\x1b[1mSur « Mes films » : rien n\'est marqué au chargement (David, banc 2)\x1b[0m');
    let r = await rail(p);
    ok('pastille rail « Mes demandes » = 2, visible (D1 + D3 non lues)', r && r.t === '2' && r.hidden === false);
    ok('D1 (auto-sélectionnée au chargement) RESTE non lue → point présent', await dot(p, 0) === 1);
    ok('D3 (avec réponse) → point présent', await dot(p, 2) === 1);
    ok('D2 (sans réponse) → AUCUN point', await dot(p, 1) === 0);

    console.log('\n\x1b[1mDesktop : naviguer vers « Mes demandes », détail visible → la demande affichée passe LUE (David, banc 1)\x1b[0m');
    await nav(p);
    ok('après navigation : le point de D1 (affichée) a disparu', await dot(p, 0) === 0);
    r = await rail(p);
    ok('après navigation : la pastille a décrémenté à 1', r && r.t === '1' && r.hidden === false);
    ok('D3 (NON affichée) garde son point', await dot(p, 2) === 1);

    console.log('\n\x1b[1mClic sur un autre fil → lu\x1b[0m');
    await p.locator('#md-liste .md-item').nth(2).click(); await p.waitForTimeout(400);
    ok('après clic sur D3 : son point disparaît', await dot(p, 2) === 0);
    r = await rail(p);
    ok('pastille retombée à 0 (masquée)', r && r.hidden === true);

    console.log('\n\x1b[1mÉquipe re-répond (texte différent) → non lu revient\x1b[0m');
    S.repA = 'Réponse B DIFFÉRENTE'; await p.reload(); await p.waitForTimeout(700); // revient sur « Mes films »
    r = await rail(p);
    ok('nouvelle réponse → pastille = 1 de nouveau', r && r.t === '1' && r.hidden === false);
    ok('nouvelle réponse → point de D1 revient', await dot(p, 0) === 1);

    console.log('\n\x1b[1mClient écrit après lecture (reponse inchangée) → reste LU (pas de faux positif)\x1b[0m');
    await nav(p); await p.waitForTimeout(200); // lit B (desktop, détail visible)
    await p.reload(); await p.waitForTimeout(700); // reponse TOUJOURS B
    r = await rail(p);
    ok('reponse inchangée → reste LU (pastille masquée)', r && r.hidden === true);
    ok('reponse inchangée → aucun point sur D1', await dot(p, 0) === 0);
    await p.close(); await ctxD.close();

    // ── MOBILE : la navigation NE marque PAS (détail masqué), le clic oui ──────────────────────────────
    console.log('\n\x1b[1mMobile : navigation ne marque pas (détail masqué) ; le clic marque\x1b[0m');
    const ctxM = await b.newContext({ viewport: { width: 760, height: 900 } });
    S.repA = 'Réponse A';
    p = await newp(ctxM, false); await p.goto(URL); await p.waitForTimeout(700);
    await nav(p);
    ok('mobile : après navigation, D1 reste NON lue (détail masqué) → point présent', await dot(p, 0) === 1);
    await p.locator('#md-liste .md-item').nth(0).click(); await p.waitForTimeout(400);
    ok('mobile : après CLIC, D1 passe lue → point disparu', await dot(p, 0) === 0);
    await p.close(); await ctxM.close();

    // ── STORAGE « vu » CASSÉ ───────────────────────────────────────────────────────────────────────────
    console.log('\n\x1b[1m⛔ localStorage « vu » indisponible → rien ne plante\x1b[0m');
    const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 } });
    S.repA = 'Réponse A';
    p = await newp(ctxB, true); await p.goto(URL); await p.waitForTimeout(700);
    ok('storage cassé : l\'écran se rend (rail présent)', await p.evaluate(() => !!document.getElementById('nv-demandes')));
    ok('storage cassé : D1 apparaît NON lue (dégradation assumée)', await dot(p, 0) === 1);
    await nav(p);
    ok('storage cassé : naviguer ne plante pas, la liste tient', await p.evaluate(() => document.querySelectorAll('#md-liste .md-item').length) === 3);
    await p.locator('#md-liste .md-item').nth(2).click(); await p.waitForTimeout(400);
    ok('storage cassé : ouvrir un fil ne plante pas', await p.evaluate(() => !!document.getElementById('md-fil')));
    await p.close(); await ctxB.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
