'use strict';
// Banc — AFFICHAGE « relevé manquant » découplé du VERROU. Sert le vrai index.html.
// Prouve :
//  - releveManquant (affichage) = EN MÉMOIRE, sans seuil : Brand · !archive · statut ∈ STATUTS_MONTAGE · !(relevé||sans) ;
//  - NON-RÉGRESSION : releveManquantNoyau (verrou) garde le seuil → une carte pré-seuil est MARQUÉE à l'affichage
//    mais le noyau du verrou la laisse false (découplage effectif) ;
//  - pas de scan DB_VERSIONS au rendu de grille / au compte (tout en mémoire) ;
//  - l'agrégat « dernier monteur » est PARESSEUX : chargé à l'ouverture du filtre, et son échec ne dégrade QUE
//    la colonne monteur (lignes + compte restent justes), avec « indisponible — réessayer » + status HTTP au warn ;
//  - pastille carte en mémoire.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const srv = http.createServer((rq,rs)=>{const p=decodeURIComponent(rq.url.split('?')[0]);const f=p==='/'?'index.html':p.replace(/^\//,'');const a=path.join(ROOT,f);if(!a.startsWith(ROOT)||!fs.existsSync(a)||fs.statSync(a).isDirectory()){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':(f.endsWith('.css')?'text/css':'text/html; charset=utf-8')});rs.end(fs.readFileSync(a));});

function installMocks(){
  window.__warns = []; const _w = console.warn; console.warn = (...a)=>{ window.__warns.push(a.join(' ')); };
  window.__versQueries = 0; window.__versThrow = false; window.__versResults = [];
  api = async (endpoint, method, body) => {
    if(/\/databases\/.*\/query/.test(endpoint)){
      if(endpoint.includes(DB_VERSIONS)){ window.__versQueries++; if(window.__versThrow){ const e=new Error('simulé'); e.status=429; throw e; } return { results: window.__versResults, has_more:false }; }
      return { results: [], has_more:false };
    }
    return { id:'n', results:[] };
  };
  upd = async ()=>({}); toast = ()=>{}; openDetail = ()=>{};
  loadMusiques=()=>{}; loadVersions=async()=>{}; loadRetours=()=>{}; loadComments=()=>{}; prefetchDriveFolder=()=>{};
  loadNotifs=()=>{}; createNotif=async()=>{}; contactsBrandANotifier=()=>[];
  masquerConflitFiche=()=>{}; demarrerPollingFiche=()=>{}; relireFicheOuverte=()=>{};
  currentUser = { nom:'X', role:'Monteur' };
  currentPage = 'production'; currentVue = 'cards'; curFilter = { format:null, etat:null };
  if(!document.getElementById('cards-wrap')){ const d=document.createElement('div'); d.id='cards-wrap'; document.body.appendChild(d); }
}

let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('pageerror',()=>{});
  await page.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);

  // 1) releveManquant — table de vérité EN MÉMOIRE, sans seuil
  console.log('\n\x1b[1mAffichage (releveManquant) — en mémoire, sans seuil\x1b[0m');
  const a1 = await page.evaluate(() => {
    const mk = (o) => Object.assign({ id:'x', format:'Brand', archive:false, statut:'Montage', releveMusique:false, sansMusique:false, journaliste:'J' }, o);
    return {
      montage:    releveManquant(mk({statut:'Montage'})),
      pad:        releveManquant(mk({statut:'PAD'})),
      retours:    releveManquant(mk({statut:'Retours'})),
      validation: releveManquant(mk({statut:'Validation chef'})),
      sequencier: releveManquant(mk({statut:'Séquencier en cours'})),
      tournage:   releveManquant(mk({statut:'En tournage'})),
      postprod:   releveManquant(mk({statut:'Post-prod'})),
      releveFait: releveManquant(mk({statut:'Montage', releveMusique:true})),
      sansMus:    releveManquant(mk({statut:'Montage', sansMusique:true})),
      archive:    releveManquant(mk({statut:'Montage', archive:true})),
      nonBrand:   releveManquant(mk({statut:'Montage', format:'MAG'}))
    };
  });
  ok('Montage sans relevé → marqué', a1.montage===true);
  ok('PAD / Retours / Validation chef → marqués', a1.pad && a1.retours && a1.validation);
  ok('amont (Séquencier, En tournage, Post-prod) → NON marqués', !a1.sequencier && !a1.tournage && !a1.postprod);
  ok('relevé fait → non marqué', a1.releveFait===false);
  ok('« sans musique » → non marqué', a1.sansMus===false);
  ok('archivé → non marqué', a1.archive===false);
  ok('non-Brand → non marqué', a1.nonBrand===false);

  // 2) NON-RÉGRESSION : le verrou garde le seuil, l'affichage non (découplage)
  console.log('\n\x1b[1mNon-régression — verrou garde le seuil, affichage découplé\x1b[0m');
  const a2 = await page.evaluate(() => {
    const s = { id:'S', format:'Brand', archive:false, statut:'Montage', releveMusique:false, sansMusique:false, journaliste:'J' };
    return {
      // Affichage : ne regarde PAS le seuil → marqué même pour une carte « pré-seuil »
      affichage: releveManquant(s),
      // Verrou (noyau) : INCHANGÉ, gardé par le post-seuil fourni par l'appelant
      noyauPreSeuil:  releveManquantNoyau(s, false),   // version pré-seuil → pas de blocage
      noyauPostSeuil: releveManquantNoyau(s, true),    // version post-seuil → blocage
      noyauRelFait:   releveManquantNoyau({...s, releveMusique:true}, true),
      noyauNonBrand:  releveManquantNoyau({...s, format:'MAG'}, true)
    };
  });
  ok('affichage marque la carte (sans regarder le seuil)', a2.affichage===true);
  ok('verrou : pré-seuil → false (seuil respecté, pas de blocage)', a2.noyauPreSeuil===false);
  ok('verrou : post-seuil → true (blocage conservé)', a2.noyauPostSeuil===true);
  ok('verrou : relevé fait → false, non-Brand → false (noyau intact)', a2.noyauRelFait===false && a2.noyauNonBrand===false);
  ok('DÉCOUPLAGE prouvé : même carte, affichage=true ET verrou pré-seuil=false', a2.affichage===true && a2.noyauPreSeuil===false);

  // 3) Compte EN MÉMOIRE + aucun scan DB_VERSIONS au rendu/au compte
  console.log('\n\x1b[1mCompte en mémoire — zéro scan au chargement\x1b[0m');
  const a3 = await page.evaluate(() => {
    sujets = [
      { id:'M1', code:'B61A', titre:'A', format:'Brand', archive:false, statut:'Montage', releveMusique:false, sansMusique:false, journaliste:'J', priorite:'', chef:'' },
      { id:'M2', code:'B08Y', titre:'B', format:'Brand', archive:false, statut:'PAD', releveMusique:false, sansMusique:false, journaliste:'J', priorite:'', chef:'' },
      { id:'M3', code:'B12X', titre:'C', format:'Brand', archive:false, statut:'Séquencier en cours', releveMusique:false, sansMusique:false, journaliste:'J', priorite:'', chef:'' },
      { id:'M4', code:'MAG1', titre:'D', format:'MAG', archive:false, statut:'Montage', releveMusique:false, sansMusique:false, journaliste:'J', priorite:'', chef:'' }
    ];
    window.__versQueries = 0;
    curFilter = { format:null, etat:null };
    majCompteursBarre();
    const badge = document.getElementById('cnt-releve').textContent;
    // rendu grille (cartes normales) — ne doit rien scanner non plus
    renderCards();
    return { badge, scans: window.__versQueries, etat: _aggMonteurEtat };
  });
  ok('compte = 2 (M1 Montage + M2 PAD ; M3 amont et M4 MAG exclus)', a3.badge==='2');
  ok('AUCUN scan DB_VERSIONS au compte ni au rendu de grille', a3.scans===0);
  ok('agrégat resté « absent » (paresseux, pas déclenché)', a3.etat==='absent');

  // 4) Vue liste : agrégat paresseux déclenché à l'ouverture, colonne monteur alimentée
  console.log('\n\x1b[1mVue liste — agrégat paresseux à l\'ouverture\x1b[0m');
  await page.evaluate(() => {
    window.__versResults = [
      { created_time:'2026-11-08T10:00:00Z', properties:{ 'Sujet ID':{rich_text:[{plain_text:'M1'}]}, Version:{rich_text:[{plain_text:'V3'}]}, Monteur:{rich_text:[{plain_text:'MONTEUR_TEST'}]} } }
    ];
    curFilter = { format:null, etat:{t:'r',v:'manquants'} };
    renderCards();   // route vers renderRelevesManquants → chargerMonteursSiBesoin (paresseux)
  });
  await page.waitForFunction(() => _aggMonteurEtat === 'ok' || _aggMonteurEtat === 'echec', { timeout:12000 });
  const a4 = await page.evaluate(() => {
    const h = document.getElementById('cards-wrap').innerHTML;
    return { etat:_aggMonteurEtat, scans: window.__versQueries, monteur: h.includes('MONTEUR_TEST'), version: h.includes('V3'),
             listeM1: h.includes('B61A') && h.includes('B08Y'), pasAmont: !h.includes('B12X') && !h.includes('MAG1'),
             estTable: h.includes('DERNIER MONTEUR') };
  });
  ok('le filtre route bien vers la vue liste dédiée (pas des cartes)', a4.estTable===true);
  ok('agrégat chargé avec succès (état ok)', a4.etat==='ok');
  ok('ouverture du filtre → scan DB_VERSIONS déclenché', a4.scans>=1);
  ok('colonne « dernier monteur » alimentée (MONTEUR_TEST, V3)', a4.monteur && a4.version);
  ok('liste = les bons sujets (M1, M2) ; amont/MAG exclus', a4.listeM1 && a4.pasAmont);

  // 5) Échec de l'agrégat : seule la colonne monteur se dégrade ; lignes + compte intacts ; warn porte le status
  console.log('\n\x1b[1mÉchec de l\'agrégat — dégradation contenue, warn avec status\x1b[0m');
  await page.evaluate(() => {
    _aggMonteurEtat = 'absent'; _aggVersions = null; window.__versQueries = 0; window.__warns = []; window.__versThrow = true;
    curFilter = { format:null, etat:{t:'r',v:'manquants'} };
    renderCards();
  });
  await page.waitForFunction(() => _aggMonteurEtat === 'echec', { timeout:15000 });
  const a5 = await page.evaluate(() => {
    const h = document.getElementById('cards-wrap').innerHTML;
    majCompteursBarre();
    return { indispo: h.includes('indisponible'), reessayer: h.includes('Réessayer'),
             lignes: h.includes('B61A') && h.includes('B08Y'),   // les lignes restent
             badge: document.getElementById('cnt-releve').textContent,
             warnStatus: window.__warns.some(w => /HTTP 429/.test(w)) };
  });
  ok('colonne monteur « indisponible » + bouton « Réessayer »', a5.indispo && a5.reessayer);
  ok('les lignes (la sélection) restent affichées', a5.lignes===true);
  ok('le compte reste juste malgré l\'échec (en mémoire)', a5.badge==='2');
  ok('le console.warn porte le status HTTP réel (429)', a5.warnStatus===true);

  // 6) Pastille carte — en mémoire
  console.log('\n\x1b[1mPastille carte — en mémoire\x1b[0m');
  const a6 = await page.evaluate(() => {
    const base = { id:'P', code:'B61A', titre:'t', format:'Brand', archive:false, journaliste:'J', chef:'', priorite:'', releveMusique:false, sansMusique:false };
    return {
      montage: cardHTML({...base, statut:'Montage'}).includes('Relevé manquant'),
      amont:   cardHTML({...base, statut:'Séquencier en cours'}).includes('Relevé manquant'),
      fait:    cardHTML({...base, statut:'Montage', releveMusique:true}).includes('Relevé manquant')
    };
  });
  ok('pastille présente si Brand en montage sans relevé', a6.montage===true);
  ok('pas de pastille en amont', a6.amont===false);
  ok('pas de pastille si relevé fait', a6.fait===false);

  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
