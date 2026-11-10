'use strict';
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const srv = http.createServer((rq,rs)=>{const p=rq.url.split('?')[0];const f=p==='/'?'index.html':p.replace(/^\//,'');const a=path.join(ROOT,f);if(!fs.existsSync(a)||fs.statSync(a).isDirectory()){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});rs.end(fs.readFileSync(a));});

// On NE mocke PAS apiQueryAll : on garde la VRAIE (elle renvoie { results }). On mocke seulement `api`, avec un
// faux Notion en mémoire → fidélité maximale, c'est elle qui rend la classe de bug visible.
function installMocks(){
  window.__db = { musiques: [] };     // { id, archived, sujetId }
  window.__failArchiveIds = [];        // ids dont le PATCH archive doit LEVER (simulation d'échec d'archivage)
  window.__cerr = 0;
  const _ce = console.error; console.error = (...a)=>{ window.__cerr++; };
  let seq = 0;
  function sidOf(body){ return body?.properties?.['Sujet ID']?.rich_text?.[0]?.text?.content || ''; }
  api = async (endpoint, method, body) => {
    if (method==='POST' && endpoint==='/pages'){ const id='n'+(++seq); window.__db.musiques.push({id,archived:false,sujetId:sidOf(body),props:body.properties}); return {id}; }
    const mp = endpoint.match(/^\/pages\/(.+)$/);
    if (method==='PATCH' && mp){ const id=mp[1]; if (window.__failArchiveIds.indexOf(id)!==-1) throw new Error('archive refusée (simulé) '+id); const r=window.__db.musiques.find(x=>x.id===id); if(r&&body.archived) r.archived=true; return {id}; }
    const mq = endpoint.match(/^\/databases\/.+\/query$/);
    if (method==='POST' && mq){ const sid=body?.filter?.rich_text?.equals; return { results: window.__db.musiques.filter(r=>!r.archived && (!sid||r.sujetId===sid)), has_more:false }; }
    return { results: [] };
  };
  upd = async (id,field,type,value)=>{ window.__upd=window.__upd||[]; window.__upd.push({field,value}); return {}; };
  toast = ()=>{}; openDetail = ()=>{};
}
function seed(n, sid){ return Array.from({length:n},(_,i)=>({id:'old'+sid+'_'+i,archived:false,sujetId:sid,props:{Titre:{title:[{text:{content:'Orph'+i}}]}}})); }

let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch(); const page = await browser.newPage(); page.on('pageerror',()=>{});
  await page.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);

  // 1) Le mock est FIDÈLE : apiQueryAll renvoie { results } (objet), et un for…of dessus lève — c'est ce qui aurait
  //    attrapé le bug. (Preuve que le banc colle désormais à la signature réelle.)
  console.log('\n\x1b[1mMock fidèle : apiQueryAll renvoie { results }\x1b[0m');
  const m1 = await page.evaluate(async () => {
    const t = await apiQueryAll('/databases/x/query', {});
    let leve=false; try { for (const _ of t){} } catch(e){ leve = (e.name==='TypeError'); }
    return { objet: !Array.isArray(t) && (t&&typeof t==='object'&&'results' in t), forOfLeve: leve };
  });
  ok('apiQueryAll renvoie un objet { results }', m1.objet);
  ok('un for…of dessus lève (le mock aurait vu le bug)', m1.forOfLeve);

  // 2) Succès : archive l'ancien, ne garde que le nouveau, arme la case.
  console.log('\n\x1b[1mSuccès — archive tout, garde le nouveau, arme\x1b[0m');
  const r2 = await page.evaluate(async () => {
    sujets=[{id:'S2',code:'B',titre:'x',format:'Brand'}]; prpState={sujetId:'S2'};
    window.__db={musiques:[{id:'oldA',archived:false,sujetId:'S2',props:{}},{id:'oldB',archived:false,sujetId:'S2',props:{}}]};
    window.__upd=[]; window.__cerr=0;
    await prpEcrire('S2', [{titre:'Nouveau',reference:'R',auteurs:'A',sur:false,passages:[[0,30]],total:30}]);
    const actifs = window.__db.musiques.filter(m=>!m.archived);
    return { nbActifs:actifs.length, titre:actifs[0]&&(actifs[0].props.Titre?.title?.[0]?.text?.content), arme:window.__upd.some(u=>u.field==='Relevé musique'&&u.value===true), cerr:window.__cerr };
  });
  ok('1 seule ligne active (le nouveau)', r2.nbActifs===1 && r2.titre==='Nouveau');
  ok('case armée', r2.arme===true);
  ok('aucune erreur (succès)', r2.cerr===0);

  // 3) Échec d'archivage → rollback : les lignes CRÉÉES sont effacées, case NON armée, cause en console.
  console.log('\n\x1b[1mÉchec d\'archivage → rollback, zéro ligne créée laissée\x1b[0m');
  const r3 = await page.evaluate(async () => {
    sujets=[{id:'S3',code:'B',titre:'x',format:'Brand'}]; prpState={sujetId:'S3'};
    window.__db={musiques:[{id:'oldX',archived:false,sujetId:'S3',props:{}}]};
    window.__failArchiveIds=['oldX'];   // l'archivage de l'ancienne lève
    window.__upd=[]; window.__cerr=0;
    await prpEcrire('S3', [{titre:'Nouveau',reference:'R',auteurs:'A',sur:false,passages:[[0,30]],total:30}]);
    window.__failArchiveIds=[];
    const actifs = window.__db.musiques.filter(m=>!m.archived);
    const nouvellesActives = actifs.filter(m=>m.props.Titre?.title?.[0]?.text?.content==='Nouveau').length;
    return { nouvellesActives, arme:window.__upd.some(u=>u.field==='Relevé musique'&&u.value===true), cerr:window.__cerr };
  });
  ok('la ligne créée est rollback (aucune « Nouveau » active)', r3.nouvellesActives===0);
  ok('case NON armée (relevé non validé)', r3.arme===false);
  ok('cause tracée en console (console.error appelé)', r3.cerr>=1);

  // 4) Six orphelines (cas B09X) : un re-dépôt réussi n'en laisse que les nouvelles.
  console.log('\n\x1b[1mSix orphelines (B09X) → re-dépôt n\'en laisse que les nouvelles\x1b[0m');
  const r4 = await page.evaluate(async (seedN) => {
    sujets=[{id:'S4',code:'B09X',titre:'x',format:'Brand'}]; prpState={sujetId:'S4'};
    // 3 paires identiques = 6 orphelines, case NON (exactement l'état de B09X)
    window.__db={musiques:[]}; for(let i=0;i<6;i++) window.__db.musiques.push({id:'orph'+i,archived:false,sujetId:'S4',props:{Titre:{title:[{text:{content:'Resonance'}}]}}});
    window.__upd=[]; window.__cerr=0;
    await prpEcrire('S4', [{titre:'A',reference:'R1',auteurs:'',sur:false,passages:[[0,30]],total:30},{titre:'B',reference:'R2',auteurs:'',sur:false,passages:[[0,20]],total:20}]);
    const actifs = window.__db.musiques.filter(m=>!m.archived);
    return { nbActifs:actifs.length, titres:actifs.map(m=>m.props.Titre?.title?.[0]?.text?.content).sort(), arme:window.__upd.some(u=>u.field==='Relevé musique'&&u.value===true) };
  });
  ok('6 orphelines archivées → seulement 2 lignes actives', r4.nbActifs===2);
  ok('ce sont bien les nouvelles (A, B)', JSON.stringify(r4.titres)===JSON.stringify(['A','B']));
  ok('case armée', r4.arme===true);

  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
