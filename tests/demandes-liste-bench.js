'use strict';
// Banc NAVIGATEUR — PR-A « Mes demandes » : la séquence « liste vide → envoi réussi → la demande apparaît ».
// Régression #250 : la branche vide de renderListeDemandes détruisait #md-liste, et le garde-fou de
// chargerMesDemandes (sur #md-liste) renvoyait AVANT le fetch → un client qui venait d'envoyer sa 1re demande
// voyait toujours « Aucune demande ». Aucun des 17 bancs ne jouait cette séquence — c'est pour ça qu'elle a
// échappé. Ce banc la joue, et vérifie aussi que la branche d'ÉCHEC écrit son message DEPUIS l'état vide.

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = b64u({ id: '0'.repeat(32), exp: Math.floor(Date.now() / 1000) + 99999 }) + '.sig';
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const SENTINELLE = 'MA-DEMANDE-SENTINELLE-42';

// 'mes' renvoie [] AVANT le 'creer' (liste vide), puis mesApres() APRÈS (une demande, ou un échec selon le scénario).
function serveur(mesApres) {
  let envoye = false;
  return http.createServer(function (req, res) {
    const u = req.url.split('?')[0];
    if (u.indexOf('/.netlify/functions/') === 0) {
      let body = '';
      req.on('data', function (c) { body += c; });
      req.on('end', function () {
        res.setHeader('content-type', 'application/json');
        if (u.endsWith('espace-client')) return res.end(JSON.stringify(ESPACE));
        if (u.endsWith('mission-client')) return res.end(JSON.stringify({ ok: true, missions: [] }));
        if (u.endsWith('demande-client')) {
          let action = ''; try { action = JSON.parse(body || '{}').action; } catch (e) {}
          if (action === 'creer') { envoye = true; return res.end(JSON.stringify({ ok: true })); }
          if (!envoye) return res.end(JSON.stringify({ ok: true, demandes: [] })); // liste vide au départ
          return res.end(mesApres());                                              // après envoi
        }
        return res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    const f = path.join(process.cwd(), u === '/' ? '/client.html' : u);
    fs.readFile(f, function (e, d) { if (e) { res.statusCode = 404; return res.end('x'); } res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(d); });
  });
}

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const txtMd = (p) => p.evaluate(() => { var e = document.getElementById('md-dem'); return e ? e.innerText : ''; });

async function envoiDepuisVide(b, mesApres, msg) {
  const srv = serveur(mesApres); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} }, TOKEN);
  await p.goto('http://localhost:' + port + '/client.html'); await p.waitForTimeout(500);
  await p.click('#nv-demandes'); await p.waitForTimeout(300);
  const vide = await txtMd(p);
  // envoi d'une première demande
  await p.click('#dem-nouv'); await p.waitForTimeout(150);
  await p.fill('#dem-msg', msg);
  await p.click('#dem-envoi'); await p.waitForTimeout(600);
  const apres = await txtMd(p);
  const items = await p.evaluate(() => document.querySelectorAll('#md-dem .md-item').length);
  await p.close(); srv.close();
  return { vide: vide, apres: apres, items: items };
}

(async () => {
  const b = await chromium.launch();
  try {
    console.log('\n\x1b[1mMes demandes — vide → envoi\x1b[0m');

    // A — après envoi, 'mes' renvoie la demande : elle DOIT apparaître, « Aucune demande » DOIT disparaître.
    const A = await envoiDepuisVide(b,
      () => JSON.stringify({ ok: true, demandes: [{ ref: 'D-TEST0001', message: SENTINELLE, type: 'Autre', statut: 'Nouvelle', reponse: '', traitePar: '', codeCarte: '', date: '2026-11-16T10:00:00Z' }] }),
      SENTINELLE);
    ok('A : l\'état vide s\'affiche au départ', /Aucune demande/.test(A.vide));
    ok('A : la demande envoyée APPARAÎT', A.apres.indexOf(SENTINELLE) !== -1);
    ok('A : « Aucune demande » a disparu', !/Aucune demande/.test(A.apres));
    ok('A : une ligne de liste existe', A.items === 1);

    // B — après envoi, le rechargement 'mes' ÉCHOUE (ok:false) : le message d'indispo doit s'écrire DEPUIS
    //     l'état vide (garde-fou sur #md-dem, pas #md-liste détruit).
    const B = await envoiDepuisVide(b, () => JSON.stringify({ ok: false }), 'une question');
    ok('B : l\'état vide s\'affiche au départ', /Aucune demande/.test(B.vide));
    ok('B : l\'échec de rechargement est LISIBLE depuis l\'état vide', /indisponible/i.test(B.apres));
    ok('B : il ne reste pas bloqué sur « Aucune demande »', !/Aucune demande/.test(B.apres));

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); await b.close(); process.exit(2); }
})();
