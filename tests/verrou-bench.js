'use strict';
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');

const srv = http.createServer((req,res) => {
  const p = req.url.split('?')[0];
  const f = p === '/' ? 'index.html' : p.replace(/^\//,'');
  const abs = path.join(ROOT, f);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});
  res.end(fs.readFileSync(abs));
});

// Installé dans la page APRÈS chargement : remplace les dépendances réseau/DOM par un faux Notion en mémoire.
function installMocks(){
  window.__db = { musiques: [], versions: [] };
  window.__log = [];
  let _seq = 0;
  const nid = () => 'id'+(++_seq);
  const DBM = DB_MUSIQUES, DBV = DB_VERSIONS;
  function rowSujet(r){ return r.properties['Sujet ID']?.rich_text?.[0]?.text?.content || r.properties['Sujet ID']?.rich_text?.[0]?.plain_text || ''; }
  api = async (endpoint, method, body) => {
    window.__log.push({api:endpoint, method});
    if (method === 'POST' && endpoint === '/pages'){
      const db = body.parent.database_id;
      const row = { id: nid(), archived:false, created_time: window.__now || new Date().toISOString(), properties: body.properties };
      if (db === DBM) window.__db.musiques.push(row); else window.__db.versions.push(row);
      return { id: row.id };
    }
    const mp = endpoint.match(/^\/pages\/(.+)$/);
    if (method === 'PATCH' && mp){
      const id = mp[1];
      for (const arr of [window.__db.musiques, window.__db.versions]){ const r = arr.find(x=>x.id===id); if (r && body.archived) r.archived = true; }
      return { id };
    }
    if ((method === 'GET' || method === undefined) && mp){   // GET /pages/{id} → renvoie la note FRAÎCHE en base
      if (window.__getFail) throw new Error('GET failed (simulé)');
      return { properties: { 'Notes chef': { rich_text: (window.__freshNote != null ? [{plain_text: window.__freshNote}] : []) } } };
    }
    const mq = endpoint.match(/^\/databases\/(.+)\/query$/);
    if (method === 'POST' && mq){
      const db = mq[1]; const sid = body?.filter?.property==='Sujet ID' ? body.filter.rich_text.equals : null;
      const arr = (db===DBM?window.__db.musiques:window.__db.versions).filter(r=>!r.archived && (!sid || rowSujet(r)===sid));
      return { results: arr };
    }
    return { results: [] };
  };
  // FIDÈLE à la vraie apiQueryAll : elle renvoie { results } (un OBJET), jamais le tableau nu. Le code de prod
  // fait ensuite (await apiQueryAll(...)).results — un mock qui renvoyait le tableau cassait ce .results (bug #219).
  apiQueryAll = async (endpoint, body) => api(endpoint, 'POST', body);
  upd = async (id, field, type, value) => {
    if (window.__failArm && field==='Relevé musique' && value===true) throw new Error('arm failed (simulé)');
    window.__log.push({upd:field, value});
    const s = sujets.find(x=>x.id===id); if (s){ if(field==='Relevé musique') s.releveMusique=value; if(field==='Sans musique') s.sansMusique=value; if(field==='Notes chef') s.notes=value; }
    return {};
  };
  toast = (m,t) => window.__log.push({toast:m});
  openDetail = ()=>{}; loadMusiques = ()=>{}; refreshUI = ()=>{}; renderCards = ()=>{}; loadVersions = async ()=>{};
  ecrireMonteurVersion = async ()=>{};
  showConfirmModal = (o)=>{ window.__log.push({confirm:o.title}); const p = o.onConfirm ? o.onConfirm() : Promise.resolve(); window.__cp = p; return p; };
  _creerVersionEnCours = false;
}

let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };
const SEUIL = Date.parse('2026-11-06T10:45:00+01:00');
const PRE = new Date(SEUIL - 86400000).toISOString();   // la veille
const POST = new Date(SEUIL + 86400000).toISOString();  // le lendemain

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const base = 'http://127.0.0.1:'+srv.address().port+'/';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', ()=>{}); // l'init de l'app peut throw sans réseau — sans incidence sur les fonctions
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(installMocks);

  // Helper : prépare un sujet + ses versions, règle currentUser, exécute une fonction.
  async function scenario(setup){ return page.evaluate(setup); }

  // ───── Cas 1 : NON-Brand garde sa case après un dépôt de version (pas de reset) ─────
  console.log('\n\x1b[1mCas 1 — non-Brand : zéro changement\x1b[0m');
  let r1 = await page.evaluate(async ({PRE}) => {
    sujets = [{ id:'S1', code:'M12', titre:'Mag', format:'Mag', releveMusique:true, sansMusique:false, notes:'' }];
    currentUser = { nom:'TESTEUR_M', role:'Monteur' };
    window.__db = { musiques:[], versions:[{id:'v1',archived:false,created_time:PRE,properties:{Version:{rich_text:[{plain_text:'V1'}]},'Sujet ID':{rich_text:[{plain_text:'S1'}]}}}] };
    window.__log = [];
    await ajouterVersion('S1');
    const s = sujets.find(x=>x.id==='S1');
    return { releve: s.releveMusique, versions: window.__db.versions.length, resetCall: window.__log.some(l=>l.upd==='Relevé musique'&&l.value===false) };
  }, {PRE});
  ok('version créée (non bloqué)', r1.versions === 2);
  ok('case Relevé musique INCHANGÉE (toujours true)', r1.releve === true);
  ok('aucun reset appliqué', r1.resetCall === false);

  // ───── Cas 2 : Brand PRÉ-seuil → dépôt autorisé + boutons manuels présents ─────
  console.log('\n\x1b[1mCas 2 — Brand pré-seuil : dépôt OK, manuel présent\x1b[0m');
  let r2 = await page.evaluate(async ({PRE}) => {
    sujets = [{ id:'S2', code:'B10', titre:'Brand vieux', format:'Brand', releveMusique:false, sansMusique:false, _postSeuil:false, notes:'' }];
    currentUser = { nom:'TESTEUR_M', role:'Monteur' };
    window.__db = { musiques:[], versions:[{id:'v1',archived:false,created_time:PRE,properties:{Version:{rich_text:[{plain_text:'V1'}]},'Sujet ID':{rich_text:[{plain_text:'S2'}]}}}] };
    window.__log = [];
    await ajouterVersion('S2');
    const bloc = musiqueBloc(sujets.find(x=>x.id==='S2'));
    return { versions: window.__db.versions.length, blocManuel: bloc.includes('Avec musique') && bloc.includes('Sans musique') };
  }, {PRE});
  ok('version créée (pré-seuil autorisé)', r2.versions === 2);
  ok('boutons manuels présents (rattrapage)', r2.blocManuel === true);

  // ───── Cas 3 : Brand POST-seuil sans relevé → dépôt TOUJOURS bloqué (verrou intact), mais le MANUEL est rouvert ─────
  // Le VERROU (ajouterVersion) garde le seuil et bloque + toast. L'AFFICHAGE, lui, rouvre le chemin manuel en
  // post-seuil (décision David, Option A) : musiqueBloc montre « Avec/Sans musique » + le .prproj, plus de « requis ».
  console.log('\n\x1b[1mCas 3 — Brand post-seuil sans relevé : verrou bloque, manuel rouvert\x1b[0m');
  let r3 = await page.evaluate(async ({POST}) => {
    sujets = [{ id:'S3', code:'B61A', titre:'Brand récent', format:'Brand', releveMusique:false, sansMusique:false, _postSeuil:true, notes:'' }];
    currentUser = { nom:'TESTEUR_M', role:'Monteur' };
    window.__db = { musiques:[], versions:[{id:'v1',archived:false,created_time:POST,properties:{Version:{rich_text:[{plain_text:'V1'}]},'Sujet ID':{rich_text:[{plain_text:'S3'}]}}}] };
    window.__log = [];
    await ajouterVersion('S3');
    const bloc = musiqueBloc(sujets.find(x=>x.id==='S3'));
    return { versions: window.__db.versions.length, bloque: window.__log.some(l=>l.toast&&l.toast.includes('Relevé musique requis')),
      blocManuel: bloc.includes('Avec musique')&&bloc.includes('Sans musique'), prpPresent: bloc.includes('.prproj'), requis: bloc.includes('Relevé requis') };
  }, {POST});
  ok('VERROU : aucune version créée (toujours bloqué post-seuil)', r3.versions === 1);
  ok('VERROU : toast « relevé requis »', r3.bloque === true);
  ok('AFFICHAGE : chemin manuel rouvert (Avec + Sans musique)', r3.blocManuel === true);
  ok('bouton .prproj présent (proposé en premier)', r3.prpPresent === true);
  ok('plus de mention « Relevé requis » dans le bloc (branche inerte)', r3.requis === false);

  // ───── Chef jamais bloqué (et le déblocage chef n'est plus nécessaire : le manuel est rouvert pour tous) ─────
  console.log('\n\x1b[1mChef jamais bloqué\x1b[0m');
  let rc = await page.evaluate(async ({POST}) => {
    sujets = [{ id:'S4', code:'B61A', titre:'x', format:'Brand', releveMusique:false, sansMusique:false, _postSeuil:true, notes:'' }];
    currentUser = { nom:'TESTEUR_C', role:'Chef' };
    window.__db = { musiques:[], versions:[{id:'v1',archived:false,created_time:POST,properties:{Version:{rich_text:[{plain_text:'V1'}]},'Sujet ID':{rich_text:[{plain_text:'S4'}]}}}] };
    window.__log = [];
    await ajouterVersion('S4');
    const bloc = musiqueBloc(sujets.find(x=>x.id==='S4'));
    return { versions: window.__db.versions.length, manuel: bloc.includes('Avec musique')&&bloc.includes('Sans musique') };
  }, {POST});
  ok('chef : version créée malgré relevé manquant', rc.versions === 2);
  ok('chef : chemin manuel visible (le déblocage sans projet n\'est plus nécessaire)', rc.manuel === true);

  // ───── Atomicité (#219) : l'armement échoue → case reste false ET rollback des lignes créées (aucun orphelin) ─────
  // L'arme est le DERNIER geste (prpEcrire :2825). S'il lève, le catch archive les lignes créées (newIds) : la nouvelle
  // ligne est donc RETIRÉE elle aussi. Les anciennes ont déjà été archivées (étape 2) avant l'échec. Net : 0 ligne
  // active + case false = « un échec ne laisse aucune ligne derrière lui », jamais « fait + doublé ».
  let ra = await page.evaluate(async () => {
    sujets = [{ id:'S5', code:'B5', titre:'x', format:'Brand', releveMusique:true, sansMusique:false, notes:'' }];
    currentUser = { nom:'TESTEUR_M', role:'Monteur' };
    // 2 anciennes lignes en base pour ce sujet
    window.__db = { musiques:[
      {id:'old1',archived:false,properties:{Titre:{title:[{plain_text:'Vieux A'}]},'Sujet ID':{rich_text:[{plain_text:'S5'}]}}},
      {id:'old2',archived:false,properties:{Titre:{title:[{plain_text:'Vieux B'}]},'Sujet ID':{rich_text:[{plain_text:'S5'}]}}}
    ], versions:[] };
    prpState = { sujetId:'S5' };
    window.__failArm = true; window.__log = [];
    await prpEcrire('S5', [{ titre:'Nouveau', total:60, reference:'REF 1-2', auteurs:'A B', sur:false, passages:[[0,60]] }]);
    window.__failArm = false;
    const actifs = window.__db.musiques.filter(m=>!m.archived);
    const nouvelleActive = actifs.some(m => (m.properties.Titre.title[0]?.text?.content || m.properties.Titre.title[0]?.plain_text) === 'Nouveau');
    const s = sujets.find(x=>x.id==='S5');
    return { caseFalse: s.releveMusique===false, nbActifs: actifs.length, nouvelleActive };
  });
  ok('case restée false (relevé NON validé)', ra.caseFalse === true);
  ok('rollback complet : aucune ligne laissée active', ra.nbActifs === 0);
  ok('la ligne créée « Nouveau » a bien été archivée (rollback)', ra.nouvelleActive === false);

  // ───── Orphelines : un essai précédent a laissé des lignes → le dépôt suivant les archive TOUTES ─────
  console.log('\n\x1b[1mOrphelines — le dépôt suivant archive tout\x1b[0m');
  let ro = await page.evaluate(async () => {
    sujets = [{ id:'S6', code:'B6', titre:'x', format:'Brand', releveMusique:false, sansMusique:false, notes:'' }];
    currentUser = { nom:'TESTEUR_M', role:'Monteur' };
    // 3 orphelines d'un run précédent + 0 case
    window.__db = { musiques:[
      {id:'o1',archived:false,properties:{Titre:{title:[{plain_text:'Orph1'}]},'Sujet ID':{rich_text:[{plain_text:'S6'}]}}},
      {id:'o2',archived:false,properties:{Titre:{title:[{plain_text:'Orph2'}]},'Sujet ID':{rich_text:[{plain_text:'S6'}]}}},
      {id:'o3',archived:false,properties:{Titre:{title:[{plain_text:'Orph3'}]},'Sujet ID':{rich_text:[{plain_text:'S6'}]}}}
    ], versions:[] };
    prpState = { sujetId:'S6' }; window.__log = [];
    await prpEcrire('S6', [{ titre:'Final', total:30, reference:'', auteurs:'', sur:false, passages:[[0,30]] }]);
    const actifs = window.__db.musiques.filter(m=>!m.archived);
    const s = sujets.find(x=>x.id==='S6');
    const tt = actifs[0]?.properties.Titre.title[0]; return { nbActifs: actifs.length, titre: tt?.text?.content || tt?.plain_text, caseTrue: s.releveMusique===true };
  });
  ok('toutes les orphelines archivées : 1 seule ligne active', ro.nbActifs === 1);
  ok('c\'est la nouvelle (Final)', ro.titre === 'Final');
  ok('case armée (succès complet)', ro.caseTrue === true);

  // ───── Export : mention de pied si débloqué chef ─────
  console.log('\n\x1b[1mExport — mention de pied du déblocage\x1b[0m');
  let re = await page.evaluate(async () => {
    sujets = [{ id:'S7', code:'B7', titre:'x', format:'Brand', journaliste:'TESTEUR_M', releveMusique:true, notes:'Note existante\n[Relevé débloqué sans projet par TESTEUR_C le 06/11/2026]' }];
    window.__db = { musiques:[{id:'m1',archived:false,properties:{Titre:{title:[{plain_text:'T'}]},Artiste:{rich_text:[]},'Durée':{rich_text:[{plain_text:'0:30'}]},'Référence':{rich_text:[]},'Sujet ID':{rich_text:[{plain_text:'S7'}]}}}], versions:[] };
    let captured=''; const origCreate=URL.createObjectURL; URL.createObjectURL=(b)=>{ captured='__CAP__'; window.__blob=b; return 'blob:x'; };
    // lire le Blob
    await exporterReleve('S7');
    const txt = await window.__blob.text();
    URL.createObjectURL=origCreate;
    return { footer: txt.includes('débloqué sans projet le 06/11/2026 — à vérifier'), nom: txt.includes('TESTEUR_C') };
  });
  ok('pied « débloqué sans projet le JJ/MM/AAAA — à vérifier » présent', re.footer === true);
  ok('le NOM du chef n\'est PAS dans le fichier livré', re.nom === false);

  // ───── Deux déblocages successifs → le pied affiche le DERNIER ─────
  console.log('\n\x1b[1mExport — deux déblocages : le pied prend le dernier\x1b[0m');
  let r2d = await page.evaluate(async () => {
    sujets = [{ id:'S8', code:'B8', titre:'x', format:'Brand', journaliste:'TESTEUR_J', releveMusique:true,
      notes:'[Relevé débloqué sans projet par TESTEUR_C2 le 01/11/2026]\n[Relevé débloqué sans projet par TESTEUR_C le 06/11/2026]' }];
    window.__db = { musiques:[{id:'m1',archived:false,properties:{Titre:{title:[{plain_text:'T'}]},Artiste:{rich_text:[]},'Durée':{rich_text:[{plain_text:'0:30'}]},'Référence':{rich_text:[]},'Sujet ID':{rich_text:[{plain_text:'S8'}]}}}], versions:[] };
    const oc=URL.createObjectURL; URL.createObjectURL=(b)=>{ window.__blob=b; return 'blob:x'; };
    await exporterReleve('S8'); const txt = await window.__blob.text(); URL.createObjectURL=oc;
    return { dernier: txt.includes('sans projet le 06/11/2026 — à vérifier'), ancien: txt.includes('01/11/2026'), nom: txt.includes('TESTEUR_C')||txt.includes('TESTEUR_C2') };
  });
  ok('le pied affiche la DERNIÈRE date (06/11)', r2d.dernier === true);
  ok('n\'affiche PAS la première date (01/11)', r2d.ancien === false);
  ok('aucun nom de chef dans le fichier livré', r2d.nom === false);

  // ───── loadVersions en échec → carte neutre, bon message, .prproj dispo, aucun faux « requis » ─────
  console.log('\n\x1b[1mÉtat neutre — versions non lues vs en cours\x1b[0m');
  let rn = await page.evaluate(() => {
    const base = { id:'S9', code:'B9', titre:'x', format:'Brand', releveMusique:false, sansMusique:false, notes:'' };
    const enCours = musiqueBloc({ ...base });                       // _postSeuil indéfini, pas d'erreur
    const echoue  = musiqueBloc({ ...base, _versErr:true });        // loadVersions a planté
    return {
      ec_prp: enCours.includes('.prproj'), ec_manuel: enCours.includes('Avec musique'), ec_requis: enCours.includes('Relevé requis'), ec_charge: enCours.includes('chargement'),
      er_prp: echoue.includes('.prproj'), er_manuel: echoue.includes('Avec musique'), er_requis: echoue.includes('Relevé requis'), er_nonlues: echoue.includes('non lues')
    };
  });
  ok('en cours : .prproj dispo, pas de manuel, pas de « requis », message « chargement »', rn.ec_prp && !rn.ec_manuel && !rn.ec_requis && rn.ec_charge);
  ok('échec : .prproj dispo, pas de manuel, AUCUN faux « requis », message « non lues »', rn.er_prp && !rn.er_manuel && !rn.er_requis && rn.er_nonlues);

  // ───── Notes chef modifiée entre le chargement et le déblocage → la modif n'est pas perdue ─────
  console.log('\n\x1b[1mDéblocage chef — GET-avant-PATCH ne perd pas l\'édition\x1b[0m');
  let rg = await page.evaluate(async () => {
    sujets = [{ id:'S10', code:'B50F', titre:'x', format:'Brand', releveMusique:false, sansMusique:false,
      notes:'Note PÉRIMÉE en mémoire' }];                           // la copie mémoire est vieille
    currentUser = { nom:'TESTEUR_C', role:'Chef' };
    window.__freshNote = 'Perf : 12k vues';                          // un autre chef a écrit ça depuis
    window.__getFail = false; window.__log = [];
    await prpDebloquerChef('S10'); await window.__cp;
    const w = window.__log.find(l=>l.upd==='Notes chef');
    return { ecrit: w?.value, armeApres: window.__log.some(l=>l.upd==='Relevé musique'&&l.value===true) };
  });
  ok('écrit sur la note FRAÎCHE (contient « Perf : 12k vues »)', (rg.ecrit||'').includes('Perf : 12k vues'));
  ok('n\'écrase PAS avec la copie mémoire périmée', !(rg.ecrit||'').includes('PÉRIMÉE'));
  ok('la trace de déblocage est appondue', (rg.ecrit||'').includes('débloqué sans projet par TESTEUR_C'));
  ok('le verrou est ouvert après la trace', rg.armeApres === true);

  // GET en échec → déblocage annulé (on ne réécrit jamais une note périmée)
  let rgf = await page.evaluate(async () => {
    sujets = [{ id:'S11', code:'B50F', titre:'x', format:'Brand', releveMusique:false, sansMusique:false, notes:'X' }];
    currentUser = { nom:'TESTEUR_C', role:'Chef' };
    window.__getFail = true; window.__log = [];
    await prpDebloquerChef('S11'); await window.__cp;
    window.__getFail = false;
    return { ecrit: window.__log.some(l=>l.upd==='Notes chef'), arme: window.__log.some(l=>l.upd==='Relevé musique') };
  });
  ok('GET en échec → AUCUNE écriture de note', rgf.ecrit === false);
  ok('GET en échec → verrou NON ouvert (annulé)', rgf.arme === false);

  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
