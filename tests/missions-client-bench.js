'use strict';
// Banc NAVIGATEUR — PR-B « Proposer un film » devient une destination. Consomme le contrat PR-A (serveur figé).
//  · le rail ouvre la destination, le formulaire s'y rend ;
//  · chips Diffusion/Format (multi) + select Type → le POST envoie des TABLEAUX (plateforme/formatImage) + sousFormat ;
//  · liste « Vos propositions N » À PLAT : tags des précisions, « Aucune précision donnée » quand rien ;
//  · table des statuts (Nouvelle→Envoyée gris, Devis→Devis envoyé bleu) ;
//  · ⛔ la réponse est signée « Réel Média » générique (jamais un nom de membre) ;
//  · objet obligatoire : vide → erreur, aucun POST.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = b64u({ id: '0'.repeat(32), exp: Math.floor(Date.now() / 1000) + 99999 }) + '.sig';
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const TYPES = { '.html': 'text/html' };
const NAME_SENT = 'Louise Martin'; // nom de membre — ne doit jamais apparaître (la signature est générique)

// Deux propositions : une détaillée (tags + réponse équipe), une sans aucune précision.
const MISSIONS = [
  { objet: 'Un format court sur nos ateliers', statut: 'Devis', plateforme: ['Instagram', 'TikTok'], formatImage: ['9:16'], sousFormat: 'Face Cam', lieu: 'Lille', pourQuand: '2026-12-01', reponse: 'On part dessus, Nicolas vous envoie le devis.', carteCreee: '', date: '2026-11-09T09:00:00Z' },
  { objet: 'Portraits de nos bénévoles', statut: 'Nouvelle', plateforme: [], formatImage: [], sousFormat: '', lieu: '', pourQuand: '', reponse: '', carteCreee: '', date: '2026-11-13T09:00:00Z' }
];

let creerBodies = [];
function serveur() {
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = ''; req.on('data', c => body += c);
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        if (u.endsWith('espace-client')) return res.end(JSON.stringify(ESPACE));
        if (u.endsWith('demande-client')) return res.end(JSON.stringify({ ok: true, demandes: [] }));
        if (u.endsWith('mission-client')) {
          let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
          if (b.action === 'mes') return res.end(JSON.stringify({ ok: true, missions: MISSIONS }));
          if (b.action === 'creer') { creerBodies.push(b); return res.end(JSON.stringify({ ok: true })); }
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
const txt = (p, s) => p.evaluate(x => { var e = document.querySelector(x); return e ? e.innerText : ''; }, s);
const nb = (p, s) => p.evaluate(x => document.querySelectorAll(x).length, s);

(async () => {
  const b = await chromium.launch();
  const srv = serveur(); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} }, TOKEN);
    await p.goto('http://localhost:' + port + '/client.html'); await p.waitForTimeout(600);

    console.log('\n\x1b[1mLa destination s\'ouvre, le formulaire s\'y rend\x1b[0m');
    ok('au chargement, le panneau missions est masqué (on est sur Mes films)', await p.evaluate(() => document.getElementById('panneau-missions').classList.contains('hidden')));
    await p.click('#nv-missions'); await p.waitForTimeout(300);
    ok('clic rail → panneau missions visible', await p.evaluate(() => !document.getElementById('panneau-missions').classList.contains('hidden')));
    ok('formulaire rendu : 5 chips Diffusion + 2 chips Format + select Type', await nb(p, '#mis-diffusion .mis-chip') === 5 && await nb(p, '#mis-format .mis-chip') === 2 && await nb(p, '#mis-type') === 1);

    console.log('\n\x1b[1mLa liste à plat + tags + statuts\x1b[0m');
    ok('2 cartes « Vos propositions »', await nb(p, '#mes-missions .mis-c') === 2);
    const c0 = await txt(p, '#mes-missions .mis-c:nth-child(2)'); // 1re carte (après le <h2>)
    ok('carte détaillée : tags Instagram / TikTok / 9:16 / Face Cam / Lille', /Instagram/.test(c0) && /TikTok/.test(c0) && /9:16/.test(c0) && /Face Cam/.test(c0) && /Lille/.test(c0));
    ok('carte détaillée : échéance en mois (Décembre 2026)', /Décembre 2026/.test(c0));
    ok('carte détaillée : statut « Devis envoyé » (Devis), pastille bleue', /Devis envoyé/.test(c0) && await p.evaluate(() => !!document.querySelector('#mes-missions .mis-c .pill.bleu')));
    ok('⛔ réponse signée « Réel Média » générique, aucun nom de membre', /réel média/i.test(c0) && c0.indexOf('Louise') === -1); // casse i : .dem-rep-by est en uppercase CSS
    const vide = await p.evaluate(() => { var cs = document.querySelectorAll('#mes-missions .mis-c'); return cs[1] ? cs[1].innerText : ''; });
    ok('carte sans précision : « Aucune précision donnée » + pastille « Envoyée » (Nouvelle)', /Aucune précision donnée/.test(vide) && /Envoyée/.test(vide));
    ok('pastille « Envoyée » est grise (Nouvelle)', await p.evaluate(() => { var cs = document.querySelectorAll('#mes-missions .mis-c'); return cs[1] && !!cs[1].querySelector('.pill.gris'); }));

    console.log('\n\x1b[1mLe formulaire envoie des TABLEAUX\x1b[0m');
    creerBodies = [];
    await p.locator('#mis-diffusion .mis-chip', { hasText: 'Instagram' }).click();
    await p.locator('#mis-diffusion .mis-chip', { hasText: 'TikTok' }).click();
    await p.locator('#mis-format .mis-chip', { hasText: '9:16' }).click();
    await p.selectOption('#mis-type', 'Mag');
    await p.fill('#mis-objet', 'Une idée de film pour nos réseaux');
    await p.click('#mis-envoi'); await p.waitForTimeout(400);
    ok('un POST creer est parti', creerBodies.length === 1);
    const body = creerBodies[0] || {};
    ok('plateforme = TABLEAU ["Instagram","TikTok"]', Array.isArray(body.plateforme) && body.plateforme.join(',') === 'Instagram,TikTok');
    ok('formatImage = TABLEAU ["9:16"]', Array.isArray(body.formatImage) && body.formatImage.join(',') === '9:16');
    ok('sousFormat = « Mag » (select) + objet transmis', body.sousFormat === 'Mag' && /Une idée de film/.test(body.objet || ''));

    console.log('\n\x1b[1mObjet obligatoire\x1b[0m');
    creerBodies = [];
    await p.reload(); await p.waitForTimeout(500); await p.click('#nv-missions'); await p.waitForTimeout(200);
    await p.click('#mis-envoi'); await p.waitForTimeout(250);
    ok('objet vide → aucun POST', creerBodies.length === 0);
    ok('objet vide → message d\'erreur lisible', /de quoi parle/i.test(await txt(p, '#mis-etat')));
    await p.close();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    srv.close(); await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); srv.close(); await b.close(); process.exit(2); }
})();
