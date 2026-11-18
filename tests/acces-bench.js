'use strict';
// Banc — « Qui a accès » (serveur) : accesClient + la route acces-client. Réseau mocké.
// Prouve : (a) cloisonnement — aucun contact d'une AUTRE marque ne sort ; (b) ⛔ aucune valeur NI longueur de
// code, seul le booléen aCode ; (c) les trois états, dont le cas « propriété Actif ABSENTE » (= actif) ;
// (d) moi = booléen SERVEUR : vrai sur la SEULE ligne de l'appelant, faux PARTOUT si callerId nul (emprunt ro) ;
// (e) DEUX formes exactes de liste blanche : sans la case {nom,mail,actif,aCode,moi} ; avec la case +code. ⛔ FRONTIÈRE :
// un appelant sans la case (gere !== true) ne reçoit JAMAIS de code. ⛔ aucun id de contact ne sort ; chaque forme
// reste une liste blanche (mordante sur une clé en plus).

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';

const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const CODE_SENT = 'ZZSECRET-CODE-9';        // valeur de Code acces — ⛔ ne doit JAMAIS sortir
const COLLEGUE_AUTRE = 'CONTACT-B50-SENT';  // contact d'une autre marque — ⛔ ne doit JAMAIS sortir

// B33 (la marque de l'appelant) : 4 cas d'états. B50 : une autre marque (cloisonnement).
const row = (id, nom, brand, actifProp, code) => { const pr = { 'Nom': { title: [{ plain_text: nom }] }, 'Mail': { rich_text: [{ plain_text: nom.toLowerCase() + '@x.fr' }] }, 'Code Brand': { rich_text: [{ plain_text: brand }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] }, 'Code acces': { rich_text: code ? [{ plain_text: code }] : [] } }; if (actifProp !== 'absent') pr['Actif'] = { checkbox: actifProp }; return { id, properties: pr }; };
const CID = '11111111-1111-1111-1111-111111111111';
const CONTACTS = [
  row(CID, 'Claire', 'B33', true, CODE_SENT),                              // actif + code → Actif
  row('22222222-2222-2222-2222-222222222222', 'Marc', 'B33', true, ''),    // actif + pas de code → En attente
  row('33333333-3333-3333-3333-333333333333', 'Sofia', 'B33', false, 'x'), // inactif → Sans accès
  row('44444444-4444-4444-4444-444444444444', 'Theo', 'B33', 'absent', 'y'),// Actif ABSENTE → actif (défaut)
  row('55555555-5555-5555-5555-555555555555', COLLEGUE_AUTRE, 'B50', true, 'zzz'), // AUTRE marque
  row('---', 'Vide', 'B99', true, '') // id → normId('') ; marque DÉDIÉE B99, hors des comptages B33 (piège de la garde explicite)
];
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };

const rep = (obj) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url) {
  const u = String(url), mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) { const db = mq[1]; if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] }); if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: CONTACTS }); return rep({ results: [] }); }
  return rep({});
};

const { accesClient } = require('../netlify/functions/_authclient');
const accesHandler = require('../netlify/functions/acces-client').handler;
const { signer } = require('../netlify/functions/_clienttoken');
const evt = (jeton) => ({ httpMethod: 'POST', headers: jeton ? { 'x-rmc-token': jeton } : {}, body: '{}' });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const parMail = (acces) => { const o = {}; (acces || []).forEach(x => { o[x.nom] = x; }); return o; };

(async () => {
  console.log('\n\x1b[1maccesClient(codeBrand, callerId) — cloisonnement + états + aCode + moi\x1b[0m');
  const r = await accesClient('B33', CID);
  ok('→ ok + 4 personnes de B33 (jamais B50)', r.ok && r.acces.length === 4);
  ok('⛔ aucun contact d\'une autre marque (B50) dans la réponse', JSON.stringify(r).indexOf(COLLEGUE_AUTRE) === -1);
  ok('⛔ aucune valeur de code', JSON.stringify(r).indexOf(CODE_SENT) === -1);
  ok('⛔ aucun id de contact dans la réponse (ni avec tirets, ni normalisé)', JSON.stringify(r).indexOf(CID) === -1 && JSON.stringify(r).indexOf(CID.replace(/-/g, '')) === -1);
  const g = parMail(r.acces);
  // LISTE BLANCHE : chaque personne porte EXACTEMENT ces 5 clés. Toute clé en plus (quel que soit son nom —
  // longueur, valeur, n'importe quoi) fait tomber le banc. Sur CHAQUE entrée, pas seulement la première.
  const CLES = ['nom', 'mail', 'actif', 'aCode', 'moi'].sort().join(',');
  const blanche = (x) => Object.keys(x).sort().join(',') === CLES;
  // MORDANT BAKÉ : le prédicat REJETTE une 6e clé arbitraire ('zz') et ACCEPTE la forme nue — la preuve vit dans le banc.
  ok('liste blanche MORDANTE : une 6e clé arbitraire fait tomber le prédicat', blanche({ nom: 'x', mail: 'y', actif: true, aCode: true, moi: false }) === true && blanche({ nom: 'x', mail: 'y', actif: true, aCode: true, moi: false, zz: 1 }) === false);
  ok('CHAQUE personne porte EXACTEMENT {nom, mail, actif, aCode, moi} — aucune clé en plus', r.acces.every(blanche));
  ok('aCode est un BOOLÉEN sur chaque personne', r.acces.every(x => typeof x.aCode === 'boolean'));
  ok('moi est un BOOLÉEN sur chaque personne', r.acces.every(x => typeof x.moi === 'boolean'));
  ok('moi=true sur EXACTEMENT une entrée', r.acces.filter(x => x.moi === true).length === 1);
  ok('cette entrée est bien l\'appelant (Claire = CID)', g.Claire.moi === true);
  ok('les autres portent moi=false', g.Marc.moi === false && g.Sofia.moi === false && g.Theo.moi === false);
  ok('état Actif : actif + aCode true (Claire)', g.Claire.actif === true && g.Claire.aCode === true);
  ok('état En attente : actif + aCode false (Marc)', g.Marc.actif === true && g.Marc.aCode === false);
  ok('état Sans accès : inactif (Sofia)', g.Sofia.actif === false);
  ok('propriété Actif ABSENTE → actif true (Theo)', g.Theo.actif === true && g.Theo.aCode === true);

  console.log('\n\x1b[1mcallerId nul (emprunt ro) — moi false PARTOUT, forme inchangée\x1b[0m');
  const rn = await accesClient('B33', null);
  ok('→ ok + 4 personnes (liste lisible malgré callerId nul)', rn.ok && rn.acces.length === 4);
  ok('moi=false sur CHAQUE entrée (garde explicite, pas une coïncidence normId(\'\'))', rn.acces.every(x => x.moi === false));
  ok('la FORME ne varie pas : 5 clés même sans appelant', rn.acces.every(blanche));

  console.log('\n\x1b[1mgérant (gere=true) — DEUXIÈME forme exacte : les cinq clés + code\x1b[0m');
  const rg = await accesClient('B33', CID, true);
  const CLES_G = ['nom', 'mail', 'actif', 'aCode', 'moi', 'code'].sort().join(',');
  const blancheG = (x) => Object.keys(x).sort().join(',') === CLES_G;
  // MORDANT BAKÉ (2e forme) : le prédicat ACCEPTE la forme à 6 clés et REJETTE une 7e clé arbitraire.
  ok('liste blanche MORDANTE (forme gérant) : une 7e clé arbitraire fait tomber le prédicat', blancheG({ nom: 'x', mail: 'y', actif: true, aCode: true, moi: false, code: 'z' }) === true && blancheG({ nom: 'x', mail: 'y', actif: true, aCode: true, moi: false, code: 'z', zz: 1 }) === false);
  ok('CHAQUE personne porte EXACTEMENT {nom, mail, actif, aCode, moi, code}', rg.acces.every(blancheG));
  ok('code est une CHAÎNE sur chaque personne', rg.acces.every(x => typeof x.code === 'string'));
  ok('le gérant voit bien la valeur du code (Claire porte le sien)', parMail(rg.acces).Claire.code === CODE_SENT);

  console.log('\n\x1b[1m⛔ FRONTIÈRE — un appelant SANS la case ne reçoit JAMAIS de code\x1b[0m');
  // La garde est `gere === true` (strict) : seul true ouvre les codes. Toute autre valeur (y compris truthy) → aucune
  // clé code, aucune valeur. Mordant baké : si la garde devenait `if (gere)`, gere=1 / 'true' / {} ferait fuiter.
  for (const g0 of [undefined, false, 0, '', 'true', 1, {}, null]) {
    const rf = await accesClient('B33', CID, g0);
    const fuite = rf.acces.some(x => Object.prototype.hasOwnProperty.call(x, 'code')) || JSON.stringify(rf).indexOf(CODE_SENT) !== -1;
    ok('gere=' + JSON.stringify(g0) + ' → aucune clé code, aucune valeur de code', !fuite);
  }

  console.log('\n\x1b[1mla route acces-client — bornée au jeton, moi selon ro\x1b[0m');
  let res = await accesHandler(evt(signer(CID).token));
  let b = JSON.parse(res.body || '{}');
  ok('appelant B33 → 200 + 4 personnes de B33', res.statusCode === 200 && b.ok && (b.acces || []).length === 4);
  ok('⛔ aucun contact B50 dans la réponse de la route', res.body.indexOf(COLLEGUE_AUTRE) === -1);
  ok('⛔ aucune valeur de code dans la réponse de la route', res.body.indexOf(CODE_SENT) === -1);
  ok('⛔ aucun id de contact dans la réponse de la route', res.body.indexOf(CID) === -1 && res.body.indexOf(CID.replace(/-/g, '')) === -1);
  ok('la route marque moi=true sur la SEULE ligne de l\'appelant', (b.acces || []).filter(x => x.moi === true).length === 1);

  // EMPRUNT (ro) : la route passe callerId=null → moi false partout. La lecture reste permise (liste complète).
  res = await accesHandler(evt(signer(CID, { ro: true, acteur: '99999999-9999-9999-9999-999999999999' }).token));
  b = JSON.parse(res.body || '{}');
  ok('emprunt ro → 200 + liste complète (4)', res.statusCode === 200 && b.ok && (b.acces || []).length === 4);
  ok('emprunt ro → moi false sur CHAQUE entrée (assertion SERVEUR, pas DOM)', (b.acces || []).every(x => x.moi === false));

  res = await accesHandler(evt(''));
  ok('sans jeton → 401', res.statusCode === 401);

  console.log('\n\x1b[1mGARDE EXPLICITE — un id normalisé en chaîne vide ne devient JAMAIS « moi »\x1b[0m');
  // Jeu DÉDIÉ (marque B99, isolée des comptages B33) : la ligne 'Vide' a un id ('---') qui se normalise en ''.
  // Avec la version naïve (const moiId = normId(callerId) → normId(null) === ''), normId('---') === '' la marquerait
  // « moi » sous callerId nul. La garde explicite distingue « pas d'appelant » de « id vide » : ce cas le MESURE.
  const rv = await accesClient('B99', null); // callerId nul = session d'emprunt (ro)
  ok('→ ok + la ligne à l\'id vide est bien présente (sinon every() passerait à vide)', rv.ok && rv.acces.length === 1);
  ok('id normalisé en \'\' → moi FAUX avec callerId nul (garde explicite, pas coïncidence normId(\'\'))', rv.acces.every(x => x.moi === false));

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
