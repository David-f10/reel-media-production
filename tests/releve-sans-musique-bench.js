'use strict';
// Banc — « sans musique » : geste confirmer+produire, document AVANT la case, export affirmatif, disponibilité
// post-seuil, zéro écriture Notes chef. Sert le vrai index.html.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const srv = http.createServer((rq,rs)=>{const p=decodeURIComponent(rq.url.split('?')[0]);const f=p==='/'?'index.html':p.replace(/^\//,'');const a=path.join(ROOT,f);if(!a.startsWith(ROOT)||!fs.existsSync(a)||fs.statSync(a).isDirectory()){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':(f.endsWith('.css')?'text/css':'text/html; charset=utf-8')});rs.end(fs.readFileSync(a));});

function installMocks(){
  window.__log = []; window.__dl = []; window.__api = [];
  api = async (endpoint, method) => { window.__api.push({endpoint, method}); if (/\/databases\/.*\/query/.test(endpoint)) return { results: window.__lignes||[] }; return { id:'n' }; };
  upd = async (id, field, type, value) => {
    window.__log.push('upd:'+field+'='+value);
    if (window.__updThrowOn === field){ window.__updThrowOn = null; throw new Error('upd KO '+field); }
    const s = sujets.find(x=>x.id===id); if(s){ if(field==='Sans musique') s.sansMusique=value; if(field==='Relevé musique') s.releveMusique=value; }
    return {};
  };
  telecharger = (c, n) => { window.__log.push('telecharger'); window.__dl.push({c, n}); };   // on n'écrit pas sur disque
  showConfirmModal = ({onConfirm}) => { window.__log.push('confirm'); window.__cp = onConfirm ? onConfirm() : Promise.resolve(); };
  toast = (m,t) => { (window.__toast=window.__toast||[]).push({m,t}); };
  openDetail = ()=>{}; refreshUI = ()=>{}; loadMusiques = ()=>{}; loadVersions = async ()=>{};
  currentUser = { nom:'X', role:'Monteur' };
}
function sujet(extra){ return Object.assign({ id:'S', code:'B48A', titre:'Sujet sans musique', format:'Brand', archive:false, statut:'PAD', journaliste:'J', chef:'C', releveMusique:false, sansMusique:false, notes:'' }, extra); }

let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('pageerror',()=>{});
  await page.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);

  // 1) marquerSansMusique : document PRODUIT avant la pose de la case ; case + décoche + archive ensuite
  console.log('\n\x1b[1mmarquerSansMusique — document AVANT la case\x1b[0m');
  const r1 = await page.evaluate(async () => {
    sujets = [ Object.assign({ id:'S', code:'B48A', titre:'Sujet sans musique', format:'Brand', archive:false, statut:'PAD', journaliste:'J', chef:'C', releveMusique:false, sansMusique:false, notes:'' }) ];
    window.__log=[]; window.__dl=[]; window.__lignes=[{id:'old1'},{id:'old2'}];
    marquerSansMusique('S'); await window.__cp;
    const iDl = window.__log.indexOf('telecharger'), iSans = window.__log.indexOf('upd:Sans musique=true');
    const s = sujets.find(x=>x.id==='S');
    return { dlCount:window.__dl.length, docAvant: iDl>=0 && iSans>=0 && iDl<iSans,
             contenu: window.__dl[0]?.c||'', nom: window.__dl[0]?.n||'',
             sans:s.sansMusique, releve:s.releveMusique,
             archive: window.__api.filter(a=>a.method==='PATCH').length };
  });
  ok('document téléchargé (1)', r1.dlCount===1);
  ok('document produit AVANT la pose de la case', r1.docAvant===true);
  ok('document affirmatif « AUCUNE MUSIQUE A DECLARER »', /AUCUNE MUSIQUE A DECLARER/.test(r1.contenu));
  ok('en-tête porte le code du sujet', r1.contenu.includes('B48A'));
  ok('nom de fichier Releve_musique_B48A_…txt', /^Releve_musique_B48A_.*\.txt$/.test(r1.nom));
  ok('case « Sans musique » posée, « Relevé musique » décochée', r1.sans===true && r1.releve===false);
  ok('les 2 lignes existantes archivées', r1.archive===2);

  // 2) Échec d'enregistrement APRÈS production : le document existe quand même, case NON posée (sûr, à réessayer)
  console.log('\n\x1b[1mÉchec d\'enregistrement → document déjà produit, case non posée\x1b[0m');
  const r2 = await page.evaluate(async () => {
    sujets = [ Object.assign({ id:'S', code:'B48A', titre:'x', format:'Brand', archive:false, statut:'PAD', journaliste:'J', chef:'C', releveMusique:false, sansMusique:false, notes:'' }) ];
    window.__log=[]; window.__dl=[]; window.__lignes=[]; window.__updThrowOn='Sans musique';
    marquerSansMusique('S'); await window.__cp;
    const s = sujets.find(x=>x.id==='S');
    return { dl:window.__dl.length, sans:s.sansMusique, err:(window.__toast||[]).some(t=>t.t==='err') };
  });
  ok('document produit malgré l\'échec réseau', r2.dl===1);
  ok('case NON posée (jamais de case sans enregistrement réussi)', r2.sans===false);
  ok('toast d\'erreur « réessayez »', r2.err===true);

  // 3) AUCUNE écriture Notes chef (la trace fragile est bannie de ce chemin)
  console.log('\n\x1b[1mZéro écriture Notes chef\x1b[0m');
  const r3 = await page.evaluate(async () => {
    sujets = [ Object.assign({ id:'S', code:'B48A', titre:'x', format:'Brand', archive:false, statut:'PAD', journaliste:'J', chef:'C', releveMusique:false, sansMusique:false, notes:'' }) ];
    window.__log=[]; window.__dl=[]; window.__lignes=[];
    marquerSansMusique('S'); await window.__cp;
    return { notesChef: window.__log.some(l=>/Notes chef/.test(l)) };
  });
  ok('marquerSansMusique n\'écrit jamais « Notes chef »', r3.notesChef===false);

  // 4) exporterReleve piloté par le flag sansMusique → document affirmatif LOCAL (aucune requête)
  console.log('\n\x1b[1mexporterReleve — sans musique, piloté par le flag, local\x1b[0m');
  const r4 = await page.evaluate(async () => {
    sujets = [ Object.assign({ id:'S', code:'B19G', titre:'y', format:'Brand', archive:false, statut:'PAD', journaliste:'J', chef:'C', releveMusique:false, sansMusique:true, notes:'' }) ];
    window.__log=[]; window.__dl=[]; window.__api=[];
    await exporterReleve('S');
    return { dl:window.__dl.length, affirm:/AUCUNE MUSIQUE A DECLARER/.test(window.__dl[0]?.c||''), queries:window.__api.filter(a=>/query/.test(a.endpoint)).length };
  });
  ok('document « sans musique » re-téléchargeable', r4.dl===1 && r4.affirm);
  ok('aucune requête réseau pour le produire (local)', r4.queries===0);

  // 5) POST-SEUIL : le chemin manuel COMPLET est rouvert (Option A), le .prproj reste proposé en premier
  console.log('\n\x1b[1mManuel rouvert en post-seuil (musiqueBloc)\x1b[0m');
  const r5 = await page.evaluate(() => {
    const s = Object.assign({ id:'S', code:'B61A', titre:'z', format:'Brand', archive:false, statut:'Montage', journaliste:'J', chef:'C', releveMusique:false, sansMusique:false, _postSeuil:true });
    const h = musiqueBloc(s);
    return { avec: h.includes('🎵 Avec musique'), sans: h.includes('🔇 Sans musique'), sansGeste: h.includes("marquerSansMusique('S')"),
             prp: h.includes('.prproj'), requis: h.includes('Relevé requis') };
  });
  ok('post-seuil : « 🎵 Avec musique » ET « 🔇 Sans musique » rouverts', r5.avec===true && r5.sans===true);
  ok('post-seuil : « Sans musique » passe par le geste confirmer+produire', r5.sansGeste===true);
  ok('post-seuil : le .prproj reste proposé (en premier)', r5.prp===true);
  ok('post-seuil : plus de message « Relevé requis » (manuel rouvert, branche inerte)', r5.requis===false);

  // 6) Branche sansMusique : export + Modifier toujours offerts
  console.log('\n\x1b[1mBranche sansMusique — export + Modifier\x1b[0m');
  const r6 = await page.evaluate(() => {
    const h = musiqueBloc(Object.assign({ id:'S', code:'B50E', titre:'w', format:'Brand', archive:false, statut:'PAD', journaliste:'J', chef:'C', releveMusique:false, sansMusique:true }));
    return { exp: h.includes('📄 Exporter le relevé'), mod: h.includes('Modifier'), label: h.includes('Aucune musique à déclarer') };
  });
  ok('export « 📄 Exporter le relevé » présent', r6.exp===true);
  ok('« Modifier » présent (réversible à la main)', r6.mod===true);
  ok('libellé « Aucune musique à déclarer »', r6.label===true);

  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
