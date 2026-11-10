'use strict';
// Banc UI — extraction .prproj + overlay de choix + écriture du relevé. Sert le VRAI index.html.
//
// FIXTURES SYNTHÉTIQUES par défaut : aucun projet client, aucune référence de banque réelle, aucun nom de
// personne. Le .prproj est fabriqué ICI (XML Premiere minimal, gzippé) avec des valeurs 100 % inventées
// (banque « TESTBANK DEMO », titres « SYNTHWAVE »…). Rien de confidentiel ne vit dans le repo (et /tests/* est
// de toute façon 404 côté Netlify).
//
// MODE RÉEL OPTIONNEL (local seulement) : si tests/fixtures-local/ contient B08Y.prproj et/ou Marais.prproj
// (dossier gitignoré — déposés à la main), le banc joue EN PLUS les assertions sur ces vrais projets. Absent →
// ces assertions sont sautées, le reste tourne partout.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..');
const LOCAL = path.join(__dirname, 'fixtures-local');
const PRP_TICK = 254016000000;               // ticks Premiere/seconde (doit égaler la constante d'index.html)
const T = s => Math.round(s * PRP_TICK);

// ─── Générateur de .prproj synthétique (XML gzippé) ───
// Structure que l'extracteur suit : Sequence → TrackGroup(ref) → AudioTrack(refs clips) → AudioClipTrackItem,
// chaque clip porte <TrackItem><End>ticks</End></TrackItem> (Start omis = 0) + un <Clip ObjectRef> vers l'<AudioMedia>
// dont le <Name> est le nom de fichier banque. Un clip dont le ref média n'existe pas = son synchrone (sync++).
let _oid = 0; const oid = () => ++_oid;
function media(name){ const id=oid(); return { id, xml:`<AudioMedia ObjectID="${id}"><Name>${name}</Name></AudioMedia>` }; }
function clip(endSec, mediaRef){ const id=oid(); return { id, xml:`<AudioClipTrackItem ObjectID="${id}"><TrackItem><End>${T(endSec)}</End></TrackItem><Clip ObjectRef="${mediaRef}"/></AudioClipTrackItem>` }; }
function sequence(nom, clipIds){ const tid=oid(), sid=oid();
  const track = `<AudioTrack ObjectID="${tid}">${clipIds.map(c=>`<ClipItem ObjectRef="${c}"/>`).join('')}</AudioTrack>`;
  const seq = `<Sequence ObjectID="${sid}"><Name>${nom}</Name><TrackGroup ObjectRef="${tid}"/></Sequence>`;
  return track + seq;
}
function gzipProj(innerXml){
  const xml = `<?xml version="1.0" encoding="UTF-8"?><PremiereData>${innerXml}</PremiereData>`;
  return zlib.gzipSync(Buffer.from(xml, 'utf8'));
}
// Projet A : une séquence musicale (SYNTHWAVE 94.16 s + 1 son synchrone 30 s) + une séquence SANS musique (son synchrone).
function projetA(){
  _oid = 0;
  const m1 = media('TESTBANK_DEMO_1234_5678_SYNTHWAVE_Alpha_Beta.mp3');
  const cMus = clip(94.16, m1.id);
  const cSync = clip(30, 9999);        // ref média inexistant → son synchrone
  const seq1 = sequence('REEL_SYNTH_V1', [cMus.id, cSync.id]);
  const cSync2 = clip(5, 9998);
  const seq2 = sequence('HABILLAGE', [cSync2.id]);
  return gzipProj(m1.xml + cMus.xml + cSync.xml + cSync2.xml + seq1 + seq2);
}
const SYNTH = { 'projetA.prproj': projetA() };

// ─── Serveur : index.html + css + la fixture synthétique sous /synth/ ───
const srv = http.createServer((req,res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const mSynth = p.match(/^\/synth\/(.+)$/);
  if (mSynth && SYNTH[mSynth[1]]) { res.writeHead(200,{'Content-Type':'application/octet-stream'}); res.end(SYNTH[mSynth[1]]); return; }
  const mLocal = p.match(/^\/local\/(.+\.prproj)$/);
  if (mLocal) { const abs = path.join(LOCAL, mLocal[1]); if (fs.existsSync(abs)) { res.writeHead(200,{'Content-Type':'application/octet-stream'}); res.end(fs.readFileSync(abs)); return; } res.writeHead(404); res.end(); return; }
  const f = p === '/' ? 'index.html' : p.replace(/^\//,'');
  const abs = path.join(ROOT, f);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200,{'Content-Type': f.endsWith('.js')?'application/javascript':(f.endsWith('.css')?'text/css':'text/html; charset=utf-8')}); res.end(fs.readFileSync(abs));
});

function installMocks(){
  window.__calls = [];
  api = async (endpoint, method, body) => { window.__calls.push({op:'api', endpoint, method, body}); if (/\/databases\/.*\/query/.test(endpoint)) return { results: [] }; return { id:'n'+window.__calls.length }; };
  upd = async (id, field, type, value) => { window.__calls.push({op:'upd', id, field, value}); return {}; };
  toast = ()=>{}; openDetail = (id)=>{ window.__calls.push({op:'openDetail', id}); };
  showConfirmModal = ({onConfirm})=>{ window.__calls.push({op:'confirm'}); if(onConfirm) onConfirm(); };
  loadMusiques = ()=>{}; loadVersions = async ()=>{}; refreshUI = ()=>{}; renderCards = ()=>{};
  loadNotifs = ()=>{}; createNotif = async ()=>{}; contactsBrandANotifier = ()=>[]; prefetchDriveFolder = ()=>{};
  // Helpers de banc (pas dans index.html) : charger un .prproj depuis une URL, ou injecter un res synthétique.
  window.prpDepuisUrl = async (sujetId, url, name) => { const buf = await (await fetch(url)).arrayBuffer(); await prpTraiter(sujetId, new File([buf], name)); };
  window.prpInjecter = (sujetId, res, name) => { prpState = { sujetId, res, fileName:name }; prpOverlay(); };
}

let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const base = 'http://127.0.0.1:'+srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs=[]; page.on('pageerror', e => errs.push(e.message));
  await page.goto(base+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);
  const selSugg = () => page.evaluate(() => { const i = prpState.sugg; document.querySelector('#prp-overlay input[name=prp-seq][value="'+i+'"]').click(); });

  // ───────── Projet A synthétique : extraction + overlay + écriture ─────────
  console.log('\n\x1b[1mProjet synthétique — extraction, overlay, écriture\x1b[0m');
  await page.evaluate(() => { sujets = [{ id:'SID-A', code:'B01A', titre:'Sujet synthétique' }]; });
  await page.evaluate(u => window.prpDepuisUrl('SID-A', u, 'projet synthétique.prproj'), base+'/synth/projetA.prproj');
  await page.waitForSelector('#prp-overlay');
  ok('Valider inactif avant tout choix', await page.locator('#prp-valider').isDisabled());
  ok('aperçu de la séquence musicale (SYNTHWAVE → « Synthwave » visible)', await page.locator('#prp-overlay').getByText('Synthwave').first().isVisible());
  ok('suggérée = la séquence qui porte de la musique', await page.evaluate(() => /REEL_SYNTH_V1/.test(prpState.res.seqs[prpState.sugg].nom)));
  ok('1 séquence sans musique repliée', await page.evaluate(() => { const w=document.getElementById('prp-sans-wrap'); const bt=document.getElementById('prp-sans-btn'); return !!w && getComputedStyle(w).display==='none' && /1 séquence sans musique/.test(bt.textContent); }));
  await page.evaluate(() => { window.__calls = []; });
  await selSugg();
  ok('Valider actif après choix', !(await page.locator('#prp-valider').isDisabled()));
  await page.click('#prp-valider');
  await page.waitForFunction(() => window.__calls.some(c => c.op==='upd'), { timeout:5000 });
  const cA = await page.evaluate(() => window.__calls);
  const crA = cA.filter(c => c.op==='api' && c.method==='POST' && c.endpoint==='/pages');
  ok('1 ligne écrite, Titre « Synthwave »', crA.length===1 && crA[0].body.properties.Titre.title[0].text.content==='Synthwave');
  ok('Durée 1:34.16 (94,16 s via les ticks)', crA.length===1 && crA[0].body.properties['Durée'].rich_text[0].text.content==='1:34.16');
  ok('Référence « TESTBANK DEMO 1234-5678 »', crA.length===1 && crA[0].body.properties['Référence'].rich_text[0].text.content==='TESTBANK DEMO 1234-5678');
  ok('coche Relevé musique', cA.some(c => c.op==='upd' && c.field==='Relevé musique' && c.value===true));

  // ───────── Suggestion _Vn + repli (res synthétique injecté) ─────────
  console.log('\n\x1b[1mSuggestion _Vn (version la plus haute) + repli sans-musique\x1b[0m');
  await page.evaluate(() => { const o=document.getElementById('prp-overlay'); if(o)o.remove(); sujets=[{id:'SID-B',code:'B61A',titre:'Sujet versions'}]; });
  await page.evaluate(() => {
    const mus = (ref,tot) => ([{ media:'x.mp3', titre:'Theme', reference:ref, auteurs:'Alpha Beta', sur:false, passages:[[0,tot]], total:tot }]);
    const base = n => ({ nom:n, fin:0.48, sync:3, musiques:[] });
    const res = { inutilisees:[], seqs:[
      { nom:'REEL_SYNTH_FR',    fin:0.4788, sync:5, musiques:mus('TESTBANK DEMO 1111-2222',0.4788) },
      { nom:'REEL_SYNTH_FR_V2', fin:0.46,   sync:5, musiques:mus('TESTBANK DEMO 1111-2222',0.46) },
      { nom:'REEL_SYNTH_FR_V3', fin:0.446,  sync:5, musiques:mus('TESTBANK DEMO 1111-2222',0.446) },
      { nom:'REEL_SYNTH_FR_V4', fin:0.446,  sync:5, musiques:mus('TESTBANK DEMO 1111-2222',0.446) },
      { nom:'NEO_2', fin:0.9, sync:2, musiques:mus('OTHER LIB 9-9',0.9) },
      base('accroche'), base('plans_A'), base('plans_B'), base('live_1'), base('live_2'), base('itw_1'), base('itw_2')
    ]};
    window.prpInjecter('SID-B', res, 'projet versions.prproj');
  });
  await page.waitForSelector('#prp-overlay');
  ok('suggérée = _V4 (version la plus haute)', await page.evaluate(() => /_V4$/.test(prpState.res.seqs[prpState.sugg].nom)));
  ok('rien de coché au départ', await page.evaluate(() => !document.querySelector('#prp-overlay input[name=prp-seq]:checked')));
  ok('Valider inactif au départ', await page.locator('#prp-valider').isDisabled());
  ok('7 séquences sans musique repliées', await page.evaluate(() => { const w=document.getElementById('prp-sans-wrap'); const bt=document.getElementById('prp-sans-btn'); return getComputedStyle(w).display==='none' && /7 séquences sans musique/.test(bt.textContent); }));
  ok('5 cartes musique visibles en haut', await page.evaluate(() => [...document.querySelectorAll('#prp-overlay [data-seqcard]')].filter(c => c.closest('#prp-sans-wrap')===null).length === 5));

  // ───────── MODE RÉEL OPTIONNEL (local seulement) ─────────
  const realCases = [
    { file:'B08Y.prproj',    code:'B08Y', titre:'Resonance',     duree:'1:34.16', ref:'MYMA SCOP 0129-00301' },
    { file:'Marais.prproj',  code:'B12X', titre:'Lonely Soldier', duree:'1:26.20', ref:null }
  ].filter(c => fs.existsSync(path.join(LOCAL, c.file)));
  if (realCases.length){
    console.log('\n\x1b[1mMode réel (fixtures-local présentes) — assertions sur vrais projets\x1b[0m');
    for (const rc of realCases){
      await page.evaluate(() => { const o=document.getElementById('prp-overlay'); if(o)o.remove(); window.__calls=[]; });
      await page.evaluate(c => { sujets=[{id:'SID-R',code:c.code,titre:c.titre}]; }, rc);
      await page.evaluate(u => window.prpDepuisUrl('SID-R', u, 'vrai.prproj'), base+'/local/'+rc.file);
      await page.waitForSelector('#prp-overlay');
      await selSugg(); await page.click('#prp-valider');
      await page.waitForFunction(() => window.__calls.some(c => c.op==='upd'), { timeout:5000 });
      const cr = (await page.evaluate(() => window.__calls)).filter(c => c.op==='api' && c.method==='POST' && c.endpoint==='/pages');
      ok(rc.file+' : 1re ligne « '+rc.titre+' », '+rc.duree, cr.length>=1 && cr[0].body.properties.Titre.title[0].text.content===rc.titre && cr[0].body.properties['Durée'].rich_text[0].text.content===rc.duree);
      if (rc.ref) ok(rc.file+' : réf « '+rc.ref+' »', cr[0].body.properties['Référence'].rich_text[0].text.content===rc.ref);
    }
  } else {
    console.log('\n\x1b[2m(mode réel sauté : aucun fichier dans tests/fixtures-local/)\x1b[0m');
  }

  ok('aucune erreur JS', errs.length===0); if(errs.length) console.log('  ', errs.slice(0,4));
  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
