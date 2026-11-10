'use strict';
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = require('path').resolve(__dirname, '..');
const srv = http.createServer((req,res) => {
  const p = req.url.split('?')[0]; const f = p === '/' ? 'index.html' : p.replace(/^\//,'');
  const abs = path.join(ROOT, f);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type': f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'}); res.end(fs.readFileSync(abs));
});
function installMocks(){
  window.__api = 0;
  api = async () => { window.__api++; return { results: [], id:'x' }; };
  apiQueryAll = async () => { window.__api++; return []; };
  upd = async () => ({});
  toast = ()=>{}; openDetail = ()=>{}; loadMusiques = ()=>{}; refreshUI = ()=>{}; renderCards = ()=>{}; loadVersions = async ()=>{};
  createNotif = async ()=>{}; loadNotifs = ()=>{}; contactsBrandANotifier = ()=>[];
}
let fails=0; const ok=(n,c)=>{ console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗ ')+n+(c?'':'\x1b[0m')); if(!c) fails++; };
const SEUIL = Date.parse('2026-11-06T10:45:00+01:00');

(async () => {
  await new Promise(r => srv.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch();
  const page = await browser.newPage(); page.on('pageerror', ()=>{});
  await page.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);

  // ───────── Fenêtre unique : diff recalculé en mémoire, sans requête ; libellé du bouton ─────────
  console.log('\n\x1b[1mFenêtre unique — diff en mémoire, écriture directe\x1b[0m');
  const r1 = await page.evaluate(() => {
    const mus=(t,r,tot)=>({titre:t,reference:r,auteurs:'A B',sur:false,passages:[[0,tot]],total:tot});
    const seq=(n,ms,sy)=>({nom:n,fin:100,sync:sy||0,musiques:ms});
    const res={inutilisees:[],seqs:[ seq('REEL_V1',[mus('Resonance','REF 1',94.16)]), seq('REEL_V2',[mus('Autre','REF 2',30)]), seq('Images',[],5) ]};
    sujets=[{id:'S',code:'B',titre:'x',format:'Brand'}];
    prpState={ sujetId:'S', res, fileName:'projet vièrge.prproj', ancien:[{titre:'Vieux',duree:'1:00'}] };
    prpOverlay();
    window.__api=0;
    document.querySelector('#prp-overlay input[name=prp-seq][value="0"]').click();
    const diff0=document.getElementById('prp-diff').innerHTML, label0=document.getElementById('prp-valider').textContent, calls0=window.__api;
    document.querySelector('#prp-overlay input[name=prp-seq][value="1"]').click();
    const diff1=document.getElementById('prp-diff').innerHTML, calls1=window.__api;
    document.querySelector('#prp-overlay input[name=prp-seq][value="2"]').click();  // Images, sans musique
    const label2=document.getElementById('prp-valider').textContent;
    return { diff0, diff1, label0, label2, calls0, calls1,
             d0ok: diff0.includes('CHANGE') && diff0.includes('Resonance') && diff0.includes('Vieux'),
             d1ok: diff1.includes('Autre') && diff1.includes('Vieux'), change: diff0!==diff1 };
  });
  ok('diff séquence 0 : CHANGE, + Resonance / − Vieux', r1.d0ok);
  ok('diff séquence 1 : + Autre / − Vieux (différent)', r1.d1ok && r1.change);
  ok('AUCUNE requête Notion au changement de séquence', r1.calls0===0 && r1.calls1===0);
  ok('bouton = « Écrire le relevé » (séquence avec musique)', r1.label0==='Écrire le relevé');
  ok('bouton = « Marquer Sans musique » (séquence sans musique)', r1.label2==='Marquer Sans musique');

  // écriture directe : le bouton appelle prpEcrire, SANS showConfirmModal ; Sans musique → prpSansMusique
  const r2 = await page.evaluate(() => {
    const mus=(t,r,tot)=>({titre:t,reference:r,auteurs:'',sur:false,passages:[[0,tot]],total:tot});
    const seq=(n,ms,sy)=>({nom:n,fin:100,sync:sy||0,musiques:ms});
    const res={inutilisees:[],seqs:[ seq('REEL_V1',[mus('Resonance','REF 1',94)]), seq('Images',[],5) ]};
    sujets=[{id:'S2',code:'B',titre:'x',format:'Brand'}];
    prpState={ sujetId:'S2', res, fileName:'f.prproj', ancien:[] };
    window.__confirm=0; showConfirmModal=()=>{ window.__confirm++; };
    window.__ecrire=null; prpEcrire=async(sid,lignes)=>{ window.__ecrire={sid,n:lignes.length}; };
    window.__sans=0; prpSansMusique=async()=>{ window.__sans++; };
    prpOverlay();
    document.querySelector('#prp-overlay input[name=prp-seq][value="0"]').click();
    document.getElementById('prp-valider').click();   // séquence avec musique → prpEcrire
    const apres={ confirm:window.__confirm, ecrire:window.__ecrire, sans:window.__sans };
    // re-ouvre et choisit la séquence sans musique
    prpState={ sujetId:'S2', res, fileName:'f.prproj', ancien:[] }; prpOverlay();
    document.querySelector('#prp-overlay input[name=prp-seq][value="1"]').click();
    document.getElementById('prp-valider').click();   // Images → prpSansMusique
    return { apres, sans:window.__sans, confirm:window.__confirm };
  });
  ok('« Écrire le relevé » → prpEcrire (1 ligne), pas de modal', r2.apres.ecrire && r2.apres.ecrire.n===1 && r2.apres.confirm===0);
  ok('« Marquer Sans musique » → prpSansMusique, pas de modal', r2.sans===1 && r2.confirm===0);

  // ───────── Pop-up après updateVersionUrl : les 4 conditions ─────────
  console.log('\n\x1b[1mPop-up après le dépôt du lien — conditions\x1b[0m');
  async function depot({role, postSeuil, releve, url, vid}){
    return page.evaluate(async ({role, postSeuil, releve, url, vid, SEUIL}) => {
      currentUser = { nom:'X', role };
      sujets = [{ id:'SV', code:'B61A', titre:'x', format:'Brand', chef:'C', journaliste:'J',
        releveMusique: releve, sansMusique:false,
        _versDates: { [vid]: postSeuil ? SEUIL+86400000 : SEUIL-86400000 } }];
      window.__prompt = 0; prpPromptReleve = () => { window.__prompt++; };
      await updateVersionUrl(vid, 'SV', url, 'V2', null);
      return window.__prompt;
    }, {role, postSeuil, releve, url, vid, SEUIL});
  }
  ok('Brand monteur, post-seuil, relevé non fait → pop-up (1)', (await depot({role:'Monteur',postSeuil:true,releve:false,url:'https://drive.google.com/a',vid:'v1'}))===1);
  ok('Chef → aucun pop-up', (await depot({role:'Chef',postSeuil:true,releve:false,url:'https://drive.google.com/b',vid:'v2'}))===0);
  ok('version PRÉ-seuil (correction d\'un vieux lien) → aucun pop-up', (await depot({role:'Monteur',postSeuil:false,releve:false,url:'https://drive.google.com/c',vid:'v3'}))===0);
  ok('relevé déjà fait → aucun pop-up', (await depot({role:'Monteur',postSeuil:true,releve:true,url:'https://drive.google.com/d',vid:'v4'}))===0);

  // « pas deux » : deux updateVersionUrl avec le MÊME lien → pop-up une seule fois (garde _lienNotifie)
  const r3 = await page.evaluate(async ({SEUIL}) => {
    currentUser = { nom:'X', role:'Monteur' };
    sujets = [{ id:'SV2', code:'B', titre:'x', format:'Brand', chef:'C', journaliste:'J', releveMusique:false, sansMusique:false, _versDates:{ 'vA': SEUIL+86400000 } }];
    window.__prompt = 0; prpPromptReleve = () => { window.__prompt++; };
    if (typeof _lienNotifie==='object') delete _lienNotifie['vA'];
    await updateVersionUrl('vA','SV2','https://drive.google.com/same','V2',null);
    await updateVersionUrl('vA','SV2','https://drive.google.com/same','V2',null);  // même lien
    return window.__prompt;
  }, {SEUIL});
  ok('même lien déposé deux fois → pop-up UNE seule fois', r3===1);

  // ───────── Pop-up : DOM fermable (Plus tard / Choisir) ─────────
  console.log('\n\x1b[1mPop-up — fermable, boutons\x1b[0m');
  const r4 = await page.evaluate(() => {
    delete window.prpPromptReleve; // restaurer la vraie (redéfinie plus haut comme spy sur window ? non : c'est une fn globale)
    sujets = [{ id:'SP', code:'B61A', titre:'Volaille' }];
    // réinstaller la vraie fonction en rechargeant son texte n'est pas trivial — on teste via un appel direct :
    return typeof prpPromptReleve;
  });
  // La vraie prpPromptReleve a été remplacée par un spy dans les tests précédents ; on la teste séparément
  // en rechargeant la page pour repartir de la vraie définition.
  await page.goto('http://127.0.0.1:'+srv.address().port+'/', { waitUntil:'domcontentloaded' });
  await page.evaluate(installMocks);
  const r5 = await page.evaluate(() => {
    sujets = [{ id:'SP', code:'B61A', titre:'Volaille' }];
    prpChoisir = ()=>{ window.__choisir=(window.__choisir||0)+1; };
    prpPromptReleve('SP','V3');
    const ov = document.getElementById('prp-prompt');
    const txt = ov ? ov.textContent : '';
    const hasChoisir = !!document.getElementById('prp-prompt-choisir');
    const hasPlusTard = txt.includes('Plus tard');
    const bloque = txt.includes('bloquée tant que le relevé manque');
    // « Choisir le projet » ferme le pop-up et appelle prpChoisir
    document.getElementById('prp-prompt-choisir').click();
    const fermeApresChoisir = !document.getElementById('prp-prompt');
    return { present: !!ov, hasChoisir, hasPlusTard, bloque, choisirAppel: window.__choisir, fermeApresChoisir };
  });
  ok('pop-up affiché avec « Choisir le projet » et « Plus tard »', r5.present && r5.hasChoisir && r5.hasPlusTard);
  ok('dit que la version suivante sera bloquée', r5.bloque);
  ok('« Choisir le projet » ferme le pop-up et lance prpChoisir', r5.choisirAppel===1 && r5.fermeApresChoisir);

  await browser.close(); srv.close();
  console.log('\n' + (fails?'\x1b[31m'+fails+' FAIL':'\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails?1:0);
})().catch(e => { console.error(e); process.exit(2); });
