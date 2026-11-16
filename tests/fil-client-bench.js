'use strict';
// Banc NAVIGATEUR — PR-2 « Le fil à l'écran client ». Serveur mock STATEFUL (poster/clore/rouvrir changent
// l'état, un re-'fil' les reflète). Vérifie le contrat de PR-1 consommé côté client.html :
//  · le fil se rend : message initial + réponse équipe EN RETRAIT (.md-b.eux), ordre correct ;
//  · le composeur poste et le message RÉAPPARAÎT sans recharger la page ;
//  · « Modifier » n'apparaît QUE sur le dernier message ET seulement s'il est du client (un cas par banc) ;
//  · « C'est réglé » clôt et fige ; « Rouvrir » rouvre ;
//  · ⛔ le nom d'un membre n'apparaît JAMAIS (sentinelle « David ») ;
//  · un 409 serveur s'affiche proprement et ne casse pas l'écran ;
//  · la hauteur de la boîte NE CHANGE PAS d'une demande courte à une longue (le plancher).

const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = b64u({ id: '0'.repeat(32), exp: Math.floor(Date.now() / 1000) + 99999 }) + '.sig';
const ESPACE = { ok: true, marque: 'Refashion', interlocutrice: null, collaboration: { livres: 0, enCours: 0, depuis: null }, aValider: [], aRelire: [], enCours: [], livres: [] };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const NAME_SENT = 'David Fontaine'; // nom de membre — ne doit JAMAIS apparaître dans le fil

const moi = (t, d, mod) => ({ sens: 'Client', auteur: 'Vous', texte: t, date: d, modifieLe: mod || '', mien: true });
const eux = (t, d) => ({ sens: 'Réel Média', auteur: 'Réel Média', texte: t, date: d, modifieLe: '', mien: false });
const initial = (t, d) => ({ sens: 'Client', auteur: 'Vous', texte: t, date: d, modifieLe: '', mien: true, initial: true });

// État mutable par demande : { ref, message, type, statut, codeCarte, date, traitePar, fil, delai }.
function etatFrais() {
  return {
    'aaaa0000000000000000000000000001': { ref: 'D-B33-01', message: 'Demande courte', type: 'Autre', statut: 'En cours', codeCarte: '', date: '2026-11-14T09:00:00Z', traitePar: '',
      fil: [initial('Demande courte', '2026-11-14T09:00:00Z')], delai: { enAttente: true, depuis: '2026-11-14T09:00:00Z' } },
    'aaaa0000000000000000000000000002': { ref: 'D-B33-02', message: 'Demande longue', type: 'Autre', statut: 'En cours', codeCarte: '', date: '2026-11-01T09:00:00Z', traitePar: '',
      fil: [initial('Demande longue avec beaucoup de contenu pour dépasser le plancher. '.repeat(3), '2026-11-01T09:00:00Z'),
        eux('Première réponse de l\'équipe, elle aussi assez longue pour remplir la boîte largement. '.repeat(2), '2026-11-02T10:00:00Z'),
        moi('Merci, une relance.', '2026-11-03T09:00:00Z'), eux('Réponse deux.', '2026-11-03T15:00:00Z'),
        moi('Encore une question.', '2026-11-04T09:00:00Z'), eux('Réponse trois.', '2026-11-04T16:00:00Z'),
        moi('Et une dernière.', '2026-11-05T09:00:00Z'), eux('Réponse quatre.', '2026-11-05T11:00:00Z')],
      delai: { enAttente: false, depuis: '' } },
    'aaaa0000000000000000000000000003': { ref: 'D-B33-03', message: 'Dernier = équipe', type: 'Autre', statut: 'En cours', codeCarte: '', date: '2026-11-06T09:00:00Z', traitePar: '',
      fil: [initial('Dernier = équipe', '2026-11-06T09:00:00Z'), eux('La balle est dans votre camp.', '2026-11-06T12:00:00Z')], delai: { enAttente: false, depuis: '' } },
    'aaaa0000000000000000000000000004': { ref: 'D-B33-04', message: 'Close', type: 'Autre', statut: 'Clôturée', codeCarte: '', date: '2026-11-07T09:00:00Z', traitePar: '',
      fil: [initial('Close', '2026-11-07T09:00:00Z'), eux('Réglé.', '2026-11-07T12:00:00Z'), moi('Merci.', '2026-11-07T13:00:00Z')], delai: { enAttente: false, depuis: '' } },
    'aaaa0000000000000000000000000005': { ref: 'D-B33-05', message: 'Sentinelle nom', type: 'Autre', statut: 'En cours', codeCarte: '', date: '2026-11-08T09:00:00Z', traitePar: NAME_SENT,
      fil: [initial('Sentinelle nom', '2026-11-08T09:00:00Z'), eux('Réponse de l\'équipe (auteur générique).', '2026-11-08T12:00:00Z')], delai: { enAttente: false, depuis: '' } },
    'aaaa0000000000000000000000000006': { ref: 'D-B33-06', message: 'Conflit 409', type: 'Autre', statut: 'En cours', codeCarte: '', date: '2026-11-09T09:00:00Z', traitePar: '',
      fil: [initial('Conflit 409', '2026-11-09T09:00:00Z')], delai: { enAttente: true, depuis: '2026-11-09T09:00:00Z' }, refuse409: true }
  };
}
const ORDRE = ['aaaa0000000000000000000000000001', 'aaaa0000000000000000000000000002', 'aaaa0000000000000000000000000003', 'aaaa0000000000000000000000000004', 'aaaa0000000000000000000000000005', 'aaaa0000000000000000000000000006'];

function serveur(state) {
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
          const d = state[b.demandeId];
          if (b.action === 'mes') return res.end(JSON.stringify({ ok: true, demandes: ORDRE.map(id => { const x = state[id]; return { id, ref: x.ref, message: x.message, type: x.type, statut: x.statut, reponse: '', traitePar: x.traitePar, codeCarte: x.codeCarte, date: x.date }; }) }));
          if (b.action === 'fil') { if (!d) { res.statusCode = 404; return res.end(JSON.stringify({ ok: false, error: 'Introuvable' })); } return res.end(JSON.stringify({ ok: true, statut: d.statut, fil: d.fil, delai: d.delai })); }
          if (b.action === 'message') {
            if (d && d.refuse409) { res.statusCode = 409; return res.end(JSON.stringify({ ok: false, error: 'Demande clôturée — rouvrez-la pour écrire' })); }
            if (d) { d.fil.push(moi(b.texte, '2026-11-16T10:00:00Z')); d.delai = { enAttente: true, depuis: '2026-11-16T10:00:00Z' }; }
            return res.end(JSON.stringify({ ok: true }));
          }
          if (b.action === 'modifier') { if (d && d.fil.length) { d.fil[d.fil.length - 1].texte = b.texte; d.fil[d.fil.length - 1].modifieLe = '2026-11-16T10:05:00Z'; } return res.end(JSON.stringify({ ok: true })); }
          if (b.action === 'clore') { if (d) { d.statut = 'Clôturée'; d.delai = { enAttente: false, depuis: '' }; } return res.end(JSON.stringify({ ok: true })); }
          if (b.action === 'rouvrir') { if (d) { d.statut = 'En cours'; } return res.end(JSON.stringify({ ok: true })); }
          return res.end(JSON.stringify({ ok: true }));
        }
        return res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    const f = path.join(process.cwd(), u === '/' ? '/client.html' : u);
    fs.readFile(f, (e, data) => { if (e) { res.statusCode = 404; return res.end('x'); } res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(data); });
  });
}

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

async function ouvrir(b, state) {
  const srv = serveur(state); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.addInitScript(t => { try { localStorage.setItem('rmc-token', t); localStorage.setItem('rmc-marque', 'Refashion'); } catch (e) {} }, TOKEN);
  await p.goto('http://localhost:' + port + '/client.html'); await p.waitForTimeout(400);
  await p.click('#nv-demandes'); await p.waitForTimeout(500); // liste + auto-sélection idx0 + 1er fil
  return { p, srv, fin: async () => { await p.close(); srv.close(); } };
}
const sel = async (p, idx) => { await p.locator('#md-liste .md-item').nth(idx).click(); await p.waitForTimeout(350); };
const nb = (p, s) => p.evaluate(x => document.querySelectorAll(x).length, s);
const detTxt = (p) => p.evaluate(() => { const e = document.getElementById('md-detail'); return e ? e.innerText : ''; });
const boxH = (p) => p.evaluate(() => { const e = document.querySelector('.md'); return e ? Math.round(e.getBoundingClientRect().height) : -1; });

(async () => {
  const b = await chromium.launch();
  try {
    console.log('\n\x1b[1mLe fil se rend\x1b[0m');
    let s = etatFrais(); let { p, fin } = await ouvrir(b, s);
    await sel(p, 1); // demande longue
    ok('fil : toutes les bulles rendues (initial + 7)', await nb(p, '#md-fil .md-b') === 8);
    ok('fil : au moins une réponse équipe EN RETRAIT (.md-b.eux)', await nb(p, '#md-fil .md-b.eux') >= 1);
    ok('fil : ordre correct — 1re bulle = message initial, PAS en retrait (client)', await p.evaluate(() => {
      const first = document.querySelector('#md-fil .md-b'); return first && !first.classList.contains('eux') && /Demande longue/.test(first.innerText);
    }));
    ok('fil : l\'auteur équipe affiché est « Réel Média »', /Réel Média/.test(await detTxt(p)));

    console.log('\n\x1b[1mLe composeur poste et le message réapparaît (sans recharger)\x1b[0m');
    await sel(p, 0); // demande courte : fil = [initial], composeur présent
    const avant = await nb(p, '#md-fil .md-b');
    await p.fill('#md-c', 'MESSAGE-AJOUTE-SENT'); await p.click('#md-send'); await p.waitForTimeout(500);
    ok('composeur : une bulle de plus après envoi', await nb(p, '#md-fil .md-b') === avant + 1);
    ok('composeur : le message posté réapparaît dans le fil', /MESSAGE-AJOUTE-SENT/.test(await detTxt(p)));
    ok('composeur : le composeur est TOUJOURS là après envoi', await nb(p, '#md-c') === 1);
    await fin();

    console.log('\n\x1b[1m« Modifier » — un cas par banc\x1b[0m');
    s = etatFrais(); ({ p, fin } = await ouvrir(b, s));
    await sel(p, 0); // dernier message = client (initial) → Modifier présent, sur le dernier seulement
    ok('dernier message du client → « Modifier » présent', await nb(p, '#md-ed-x') === 1);
    ok('« Modifier » est sur la DERNIÈRE bulle', await p.evaluate(() => !!document.querySelector('#md-fil .md-b:last-child .md-ed-x')));
    await sel(p, 2); // dernier message = équipe → aucun Modifier
    ok('dernier message = équipe → AUCUN « Modifier »', await nb(p, '#md-ed-x') === 0);
    await sel(p, 3); // close → figé
    ok('demande clôturée → AUCUN « Modifier » (figée)', await nb(p, '#md-ed-x') === 0);
    await fin();

    console.log('\n\x1b[1m« C\'est réglé » clôt et fige ; « Rouvrir » rouvre\x1b[0m');
    s = etatFrais(); ({ p, fin } = await ouvrir(b, s));
    await sel(p, 2); // dernier = équipe → bouton « C'est réglé » présent
    ok('avant : composeur présent, pas de pied clos', await nb(p, '#md-c') === 1 && await nb(p, '#md-ff') === 0);
    ok('« C\'est réglé, merci » proposé', await nb(p, '#md-clore') === 1);
    await p.click('#md-clore'); await p.waitForTimeout(500);
    ok('après clore : pied « Rouvrir » présent, composeur disparu', await nb(p, '#md-rouvrir') === 1 && await nb(p, '#md-c') === 0);
    ok('après clore : fil figé, aucun « Modifier »', await nb(p, '#md-ed-x') === 0);
    await p.click('#md-rouvrir'); await p.waitForTimeout(500);
    ok('après rouvrir : composeur revenu', await nb(p, '#md-c') === 1 && await nb(p, '#md-rouvrir') === 0);
    await fin();

    console.log('\n\x1b[1m⛔ Sentinelle : aucun nom de membre\x1b[0m');
    s = etatFrais(); ({ p, fin } = await ouvrir(b, s));
    await sel(p, 4); // la demande porte traitePar='David Fontaine' dans 'mes' ; le détail NE DOIT PAS le montrer
    const d4 = await detTxt(p);
    ok('⛔ le nom du membre (« David ») n\'apparaît PAS dans le fil', d4.indexOf('David') === -1);
    ok('la réponse équipe est bien là, signée « Réel Média »', /Réel Média/.test(d4));
    await fin();

    console.log('\n\x1b[1mUn 409 s\'affiche proprement\x1b[0m');
    s = etatFrais(); ({ p, fin } = await ouvrir(b, s));
    await sel(p, 5); // le serveur répondra 409 à 'message'
    await p.fill('#md-c', 'tentative'); await p.click('#md-send'); await p.waitForTimeout(500);
    ok('409 : le message d\'erreur s\'affiche (md-c-etat)', /clôturée|rouvrez/i.test(await p.evaluate(() => { const e = document.getElementById('md-c-etat'); return e ? e.innerText : ''; })));
    ok('409 : l\'écran n\'est PAS cassé (la boîte et le fil tiennent)', await nb(p, '.md') === 1 && await nb(p, '#md-fil .md-b') >= 1);
    await fin();

    console.log('\n\x1b[1mLe plancher : hauteur constante courte ↔ longue\x1b[0m');
    s = etatFrais(); ({ p, fin } = await ouvrir(b, s));
    await sel(p, 0); const hCourte = await boxH(p);
    await sel(p, 1); const hLongue = await boxH(p);
    ok('la hauteur de la boîte NE CHANGE PAS (courte=' + hCourte + ' vs longue=' + hLongue + ')', hCourte === hLongue && hCourte > 0);
    await fin();

    console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
    await b.close();
    process.exit(fails ? 1 : 0);
  } catch (e) { console.error(e); await b.close(); process.exit(2); }
})();
