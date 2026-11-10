'use strict';
// Banc — réarmement atomique du relevé à l'ajout de version (ajouterVersion). Vérifie :
//  - succès : version créée, 2 cases → false, mémoire APRÈS Notion, monteur écrit APRÈS le réarmement ;
//  - échec du réarmement (1re upd) → rollback : version archivée + cases restaurées, monteur NON écrit, mémoire intacte ;
//  - échec PARTIEL (2e upd) → rollback complet quand même ;
//  - rollback lui-même en échec (archivage KO) → toast « incomplet » distinct + console.error, jamais muet ;
//  - non-Brand : aucun réarmement, inchangé.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const srv = http.createServer((rq,rs)=>{const p=decodeURIComponent(rq.url.split('?')[0]);const f=p==='/'?'index.html':p.replace(/^\//,'');const a=path.join(ROOT,f);if(!a.startsWith(ROOT)||!fs.existsSync(a)||fs.statSync(a).isDirectory()){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});rs.end(fs.readFileSync(a));});

function installMocks(){
  window.__cerr = 0; const _ce = console.error; console.error = (...a)=>{ window.__cerr++; };
  api = async (endpoint, method, body) => {
    window.__api = window.__api || []; window.__api.push({endpoint, method});
    if (method==='POST' && /\/databases\/.*\/query/.test(endpoint)) return { results: window.__versions || [] };
    if (method==='POST' && endpoint==='/pages'){ window.__created = (window.__created||0)+1; return { id:'newV'+window.__created }; }
    const mp = endpoint.match(/^\/pages\/(.+)$/);
    if (method==='PATCH' && mp){ if(window.__archiveThrows) throw new Error('archive KO'); (window.__archived=window.__archived||[]).push(mp[1]); return {id:mp[1]}; }
    return {};
  };
  upd = async (sid, field, type, value) => {
    (window.__upd=window.__upd||[]).push({field, value});
    (window.__log=window.__log||[]).push('upd:'+field+'='+value);
    if (window.__updThrowOn === field){ window.__updThrowOn = null; throw new Error('upd KO '+field); }
    return {};
  };
  ecrireMonteurVersion = async (...a)=>{ (window.__monteur=window.__monteur||[]).push(a); (window.__log=window.__log||[]).push('monteur'); };
  loadVersions = async ()=>{}; renderCards = ()=>{}; toast = (m,t)=>{ (window.__toast=window.__toast||[]).push({m,t}); };
  currentUser = { nom:'X', role:'Monteur' };
  window.setup = (fmt, rel, sans) => {
    _creerVersionEnCours = false;
    window.__api=[]; window.__upd=[]; window.__log=[]; window.__monteur=[]; window.__toast=[]; window.__archived=[]; window.__created=0; window.__cerr=0; window.__updThrowOn=null; window.__archiveThrows=false;
    window.__versions = [{ id:'v1', created_time:'2026-11-07T10:00:00Z', properties:{ Version:{rich_text:[{plain_text:'V1'}]}, 'Sujet ID':{rich_text:[{plain_text:'S'}]} } }];
    sujets = [{ id:'S', code:'B61A', titre:'x', format:fmt, statut:'Montage', journaliste:'J', chef:'C', releveMusique:rel, sansMusique:sans }];
  };
}

let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('pageerror',()=>{});
  await page.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);

  // 1) SUCCÈS
  console.log('\n\x1b[1mSuccès — version créée, cases réarmées, monteur APRÈS\x1b[0m');
  const r1 = await page.evaluate(async () => {
    window.setup('Brand', true, false);
    await ajouterVersion('S');
    const s = sujets.find(x=>x.id==='S');
    const idxRel = window.__log.indexOf('upd:Relevé musique=false');
    const idxSans = window.__log.indexOf('upd:Sans musique=false');
    const idxMont = window.__log.indexOf('monteur');
    return { created:window.__created, memRel:s.releveMusique, memSans:s.sansMusique,
             updRel:window.__upd.some(u=>u.field==='Relevé musique'&&u.value===false),
             updSans:window.__upd.some(u=>u.field==='Sans musique'&&u.value===false),
             monteurApres: idxMont>idxRel && idxMont>idxSans && idxRel>=0 && idxSans>=0,
             nbArchived:window.__archived.length, toastOk:window.__toast.some(t=>t.t==='ok') };
  });
  ok('version créée', r1.created===1);
  ok('Notion : les 2 cases passées à false', r1.updRel && r1.updSans);
  ok('mémoire à false (après Notion)', r1.memRel===false && r1.memSans===false);
  ok('monteur écrit APRÈS le réarmement', r1.monteurApres);
  ok('aucune version archivée (pas de rollback)', r1.nbArchived===0);

  // 2) ÉCHEC réarmement (1re upd) → ROLLBACK
  console.log('\n\x1b[1mÉchec du réarmement (1re upd) → rollback\x1b[0m');
  const r2 = await page.evaluate(async () => {
    window.setup('Brand', true, false);
    window.__updThrowOn = 'Relevé musique';   // la 1re upd du reset lève
    await ajouterVersion('S');
    const s = sujets.find(x=>x.id==='S');
    return { archived:window.__archived, monteur:window.__monteur.length, memRel:s.releveMusique, memSans:s.sansMusique,
             restoreRel:window.__upd.some(u=>u.field==='Relevé musique'&&u.value===true),
             toastErr:window.__toast.some(t=>t.t==='err'), cerr:window.__cerr,
             toastRien:window.__toast.some(t=>/rien n.a été laissé/.test(t.m)) };
  });
  ok('version créée PUIS archivée (rollback)', r2.archived.length===1 && r2.archived[0]==='newV1');
  ok('monteur NON écrit (reset avant monteur)', r2.monteur===0);
  ok('cases restaurées (Relevé → true)', r2.restoreRel);
  ok('mémoire intacte (restée true — jamais mise à false avant Notion)', r2.memRel===true);
  ok('toast d\'erreur « rien laissé à moitié »', r2.toastErr && r2.toastRien);
  ok('cause tracée (console.error)', r2.cerr>=1);

  // 3) ÉCHEC PARTIEL (2e upd) → rollback complet
  console.log('\n\x1b[1mÉchec partiel (2e upd) → rollback complet\x1b[0m');
  const r3 = await page.evaluate(async () => {
    window.setup('Brand', true, false);
    window.__updThrowOn = 'Sans musique';   // 1re upd passe, 2e lève
    await ajouterVersion('S');
    const s = sujets.find(x=>x.id==='S');
    return { archived:window.__archived.length, monteur:window.__monteur.length, memRel:s.releveMusique,
             restoreRel:window.__upd.filter(u=>u.field==='Relevé musique'&&u.value===true).length,
             toastErr:window.__toast.some(t=>t.t==='err') };
  });
  ok('version archivée (rollback complet malgré échec partiel)', r3.archived===1);
  ok('monteur NON écrit', r3.monteur===0);
  ok('mémoire intacte (true)', r3.memRel===true);
  ok('restauration de la case Relevé tentée', r3.restoreRel>=1);
  ok('toast d\'erreur', r3.toastErr);

  // 4) ROLLBACK lui-même en échec (archivage KO) → toast distinct, jamais muet
  console.log('\n\x1b[1mRollback en échec (archivage KO) → toast « incomplet » + console.error\x1b[0m');
  const r4 = await page.evaluate(async () => {
    window.setup('Brand', true, false);
    window.__updThrowOn = 'Relevé musique'; window.__archiveThrows = true;   // reset lève ET l'archivage du rollback lève
    await ajouterVersion('S');
    return { toastIncomplet:window.__toast.some(t=>/rollback incomplet|rechargez/.test(t.m)), cerr:window.__cerr, monteur:window.__monteur.length };
  });
  ok('toast distinct « rollback incomplet / rechargez »', r4.toastIncomplet);
  ok('échec du rollback tracé en console (≥2 console.error)', r4.cerr>=2);
  ok('monteur toujours NON écrit', r4.monteur===0);

  // 5) NON-BRAND — aucun réarmement
  console.log('\n\x1b[1mNon-Brand — aucun réarmement, inchangé\x1b[0m');
  const r5 = await page.evaluate(async () => {
    window.setup('MAG', false, false);
    await ajouterVersion('S');
    return { created:window.__created, updCases:window.__upd.filter(u=>u.field==='Relevé musique'||u.field==='Sans musique').length, monteur:window.__monteur.length, archived:window.__archived.length };
  });
  ok('version créée', r5.created===1);
  ok('aucune écriture des cases relevé (non-Brand)', r5.updCases===0);
  ok('monteur écrit', r5.monteur===1);
  ok('aucun rollback', r5.archived===0);

  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
