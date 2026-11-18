'use strict';
// Banc — « Gérer les accès » (serveur) : route acces-gerer (ajouter / retirer / redonner) + le plumbing gérant de
// acces-client. Réseau mocké. Prouve, chacun mordant :
//   · porte UNIQUE : un appelant SANS la case « Peut gérer les accès » → 403 sur toute action ;
//   (e) Code Brand + Marque de la page créée viennent du JETON, jamais du corps (on envoie une autre marque exprès) ;
//   (f) « Peut gérer les accès » de la page créée est DÉCOCHÉ ;
//   (c) mail d'une AUTRE marque → refus générique, MÊME code HTTP, message muet, aucune page créée ;
//   (d) mail de SA marque → refus EXPLICITE, aucune page créée ;
//   (g) on ne peut pas se retirer soi-même ;    (h) retirer une cible d'une AUTRE marque → refusé ;
//   (i) emprunt ro → 403 sur ajouter / retirer / redonner, aucune écriture ;
//   + génération de code (format humain, suffixe sur collision) ; + acces-client rend gere + codes à un gérant.
// ⛔ Aucune valeur de code d'accès RÉELLE : les codes de ce banc sont des fixtures ou calculés par les helpers.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';
const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';

const { signer } = require('../netlify/functions/_clienttoken');
const { baseCode, genererCodeAcces } = require('../netlify/functions/_authclient');

const GID = 'a'.repeat(32); // gérante (B33, case cochée)
const SID = 'b'.repeat(32); // Sofia  (B33, cible de retrait — même marque)
const MID = 'c'.repeat(32); // Marc   (B33, PAS gérant)
const RID = 'd'.repeat(32); // Rival  (B50, autre marque)
const OID = 'e'.repeat(32); // Oliveira pré-ensemencé (B33) — pour la collision de code
const DP1 = '1'.repeat(32), DP2 = '2'.repeat(32); // deux B33 au MÊME mail (doublon manuel) — fail-closed

// row : nom, marque, actif, code, gere. Mail = <nom sans espaces>@x.fr (minuscule).
const row = (id, nom, brand, actif, code, gere) => {
  const pr = {
    'Nom': { title: [{ plain_text: nom }] },
    'Mail': { rich_text: [{ plain_text: nom.toLowerCase().replace(/\s+/g, '') + '@x.fr' }] },
    'Code Brand': { rich_text: [{ plain_text: brand }] },
    'Marque': { rich_text: [{ plain_text: 'Refashion' }] },
    'Code acces': { rich_text: code ? [{ plain_text: code }] : [] },
    'Actif': { checkbox: actif }
  };
  if (gere) pr['Peut gérer les accès'] = { checkbox: true };
  return { id, properties: pr };
};
const CODE_OLI = baseCode('Refashion', 'Oliveira'); // fixture CALCULÉE (pas un code réel) pour forcer la collision
const CONTACTS = [
  row(GID, 'Gina', 'B33', true, 'ginacode', true),
  row(SID, 'Sofia', 'B33', true, 'sofcode'),
  row(MID, 'Marc', 'B33', true, 'marccode'),
  row(RID, 'Rival', 'B50', true, 'rivcode'),
  row(OID, 'Oliveira', 'B33', true, CODE_OLI),
  row(DP1, 'Dupont', 'B33', true, 'dup1'), // mail dupont@x.fr
  row(DP2, 'Dupont', 'B33', true, 'dup2')  // MÊME mail dupont@x.fr → ambiguïté dans la marque
];
const PAGES = {}; CONTACTS.forEach(c => { PAGES[c.id] = { parent: { database_id: process.env.DB_CONTACTS_CLIENT }, properties: c.properties }; });
const BRANDS = [{ id: 'b33', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } }];

let created = [], patched = [];
const rep = (obj, status) => Promise.resolve({ ok: (status || 200) < 400, status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) { const db = mq[1]; if (db === DB_CLIENTS_BRAND) return rep({ results: BRANDS }); if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: CONTACTS }); return rep({ results: [] }); }
  if (/\/pages$/.test(u) && method === 'POST') { const body = JSON.parse(opt.body || '{}'); created.push(body); return rep({ id: 'new-' + created.length }); }
  const mp = u.match(/\/pages\/([^/?]+)$/);
  if (mp) { const id = mp[1]; if (method === 'GET') { return PAGES[id] ? rep(PAGES[id]) : rep({}, 404); } if (method === 'PATCH') { patched.push({ id, body: JSON.parse(opt.body || '{}') }); return rep({ id }); } }
  return rep({});
};

const gerer = require('../netlify/functions/acces-gerer').handler;
const acces = require('../netlify/functions/acces-client').handler;
const evt = (jeton, bodyObj) => ({ httpMethod: 'POST', headers: jeton ? { 'x-rmc-token': jeton } : {}, body: JSON.stringify(bodyObj || {}) });
const codeDe = (body) => body.properties['Code acces'].rich_text[0].text.content;
const champ = (body, k) => body.properties[k];

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const TOK = signer(GID).token;                                   // gérante, session normale
const TOK_RO = signer(GID, { ro: true, acteur: 'f'.repeat(32) }).token; // gérante, emprunt chef

(async () => {
  console.log('\n\x1b[1mGénération de code — format humain + suffixe sur collision (PUR)\x1b[0m');
  const b1 = baseCode('Refashion', 'Maria Oliveira');
  ok('format XXX.YYY, capitales, dernier mot (accents retirés)', /^[A-Z]{3}\.[A-Z]{3}$/.test(b1) && b1 === baseCode('Refashion', 'Oliveira'));
  ok('accents retirés (Koné → KON)', baseCode('Refashion', 'Amélie Koné').endsWith('.KON'));
  ok('sans collision → base inchangée', genererCodeAcces('Refashion', 'Oliveira', ['REF.XXX']) === b1);
  ok('collision → suffixe numérique (base + 2)', genererCodeAcces('Refashion', 'Oliveira', [b1]) === b1 + '2');
  ok('double collision → base + 3', genererCodeAcces('Refashion', 'Oliveira', [b1, b1 + '2']) === b1 + '3');

  console.log('\n\x1b[1mPorte unique — un NON-gérant ne peut rien\x1b[0m');
  created = []; patched = [];
  for (const a of ['ajouter', 'retirer', 'redonner']) {
    const res = await gerer(evt(signer(MID).token, { action: a, nom: 'X', mail: 'sofia@x.fr' }));
    ok('Marc (sans la case) → ' + a + ' refusé (403)', res.statusCode === 403);
  }
  ok('⛔ aucune écriture déclenchée par un non-gérant', created.length === 0 && patched.length === 0);

  console.log('\n\x1b[1m(i) emprunt ro → 403 sur les trois actions, aucune écriture\x1b[0m');
  created = []; patched = [];
  for (const a of ['ajouter', 'retirer', 'redonner']) {
    const res = await gerer(evt(TOK_RO, { action: a, nom: 'X', mail: 'sofia@x.fr' }));
    ok('ro → ' + a + ' → 403', res.statusCode === 403);
  }
  ok('⛔ aucune écriture en ro', created.length === 0 && patched.length === 0);

  console.log('\n\x1b[1mAjouter — refus unicité du mail (c) muet ailleurs, (d) explicite dans la marque\x1b[0m');
  created = [];
  const rAutre = await gerer(evt(TOK, { action: 'ajouter', nom: 'Espion', mail: 'rival@x.fr' })); // mail de B50
  const rSoi = await gerer(evt(TOK, { action: 'ajouter', nom: 'Doublon', mail: 'sofia@x.fr' }));   // mail de B33
  ok('(c) mail autre marque → refusé, AUCUNE page créée', rAutre.statusCode === 409 && created.length === 0);
  ok('(d) mail même marque → refusé, AUCUNE page créée', rSoi.statusCode === 409 && created.length === 0);
  ok('(c)(d) MÊME code HTTP (ne distingue pas les deux cas)', rAutre.statusCode === rSoi.statusCode);
  ok('⛔ (c) le message ne dit pas pourquoi (muet sur l\'existence ailleurs)', !/déjà|existe|autre|another|exists/i.test(JSON.parse(rAutre.body).error));
  ok('(d) le message dit que la personne a déjà accès', /déjà accès/i.test(JSON.parse(rSoi.body).error));

  console.log('\n\x1b[1mAjouter (libre) — (e) Code Brand du JETON, (f) « Peut gérer » décoché, code généré\x1b[0m');
  created = [];
  // ⛔ on envoie EXPRÈS une autre marque dans le corps : elle doit être ignorée.
  const rAdd = await gerer(evt(TOK, { action: 'ajouter', nom: 'Nadia Koné', mail: 'nadia@x.fr', codeBrand: 'B99', marque: 'Pirate', code: 'INJECTE' }));
  ok('ajout accepté (200) + 1 page créée', rAdd.statusCode === 200 && created.length === 1);
  const page = created[0];
  ok('(e) Code Brand de la page = B33 (jeton), PAS B99 (corps)', champ(page, 'Code Brand').rich_text[0].text.content === 'B33');
  ok('(e) Marque de la page = Refashion (jeton), PAS « Pirate »', champ(page, 'Marque').rich_text[0].text.content === 'Refashion');
  ok('(f) « Peut gérer les accès » DÉCOCHÉ', champ(page, 'Peut gérer les accès').checkbox === false);
  ok('Actif coché (il peut se connecter)', champ(page, 'Actif').checkbox === true);
  ok('code GÉNÉRÉ serveur (pas « INJECTE » du corps), format REF.xxx', codeDe(page) === baseCode('Refashion', 'Nadia Koné') && codeDe(page) !== 'INJECTE');

  console.log('\n\x1b[1mAjouter — collision de code → suffixe\x1b[0m');
  created = [];
  const rCol = await gerer(evt(TOK, { action: 'ajouter', nom: 'Oliveira', mail: 'oliveira2@x.fr' })); // même code que OID pré-ensemencé
  ok('ajout accepté + code suffixé (≠ la base déjà prise)', rCol.statusCode === 200 && codeDe(created[0]) === CODE_OLI + '2');

  console.log('\n\x1b[1mRetirer / redonner par MAIL — (g) pas soi-même, (h) hors marque = inexistant, (h-bis) doublon\x1b[0m');
  created = []; patched = [];
  const rSelf = await gerer(evt(TOK, { action: 'retirer', mail: 'gina@x.fr' }));
  ok('(g) se retirer soi-même (son propre mail) → 403, aucun PATCH', rSelf.statusCode === 403 && patched.length === 0);
  // (h) mail d'une AUTRE marque vs mail INEXISTANT : doivent être RIGOUREUSEMENT indiscernables (même code, même message).
  const rCross = await gerer(evt(TOK, { action: 'retirer', mail: 'rival@x.fr' }));   // existe en B50
  const rGhost = await gerer(evt(TOK, { action: 'retirer', mail: 'fantome@x.fr' }));  // n'existe nulle part
  ok('(h) mail autre marque → 403, aucun PATCH', rCross.statusCode === 403 && patched.length === 0);
  ok('(h) mail inexistant → 403, aucun PATCH', rGhost.statusCode === 403 && patched.length === 0);
  ok('⛔ (h) autre marque et inexistant INDISCERNABLES (même code HTTP ET même message)', rCross.statusCode === rGhost.statusCode && JSON.parse(rCross.body).error === JSON.parse(rGhost.body).error);
  // (h-bis) deux lignes de la marque au même mail → fail-closed (refus), jamais un choix arbitraire.
  const rAmbi = await gerer(evt(TOK, { action: 'retirer', mail: 'dupont@x.fr' }));
  ok('(h-bis) doublon de mail dans la marque → 403, aucun PATCH (pas de choix arbitraire)', rAmbi.statusCode === 403 && patched.length === 0);
  // chemin heureux : Sofia (unique dans la marque).
  const rDel = await gerer(evt(TOK, { action: 'retirer', mail: 'sofia@x.fr' }));
  ok('retirer Sofia (même marque, unique) → 200 + PATCH Actif=false', rDel.statusCode === 200 && patched.length === 1 && patched[0].body.properties['Actif'].checkbox === false);
  const rBack = await gerer(evt(TOK, { action: 'redonner', mail: 'sofia@x.fr' }));
  ok('redonner Sofia → 200 + PATCH Actif=true', rBack.statusCode === 200 && patched.length === 2 && patched[1].body.properties['Actif'].checkbox === true);
  const rBadId = await gerer(evt(TOK, { action: 'retirer', mail: 'pas-un-mail' }));
  ok('cible non conforme (pas un mail) → 400', rBadId.statusCode === 400);

  console.log('\n\x1b[1macces-client — plumbing gérant + ⛔ AUCUN id de contact au navigateur (les deux formes)\x1b[0m');
  const tousIds = CONTACTS.map(c => c.id).concat(CONTACTS.map(c => c.id.replace(/-/g, ''))); // avec et sans tirets
  const sansId = (raw, entrees) => tousIds.every(id => raw.indexOf(id) === -1) && entrees.every(x => !Object.prototype.hasOwnProperty.call(x, 'id'));
  const bG = (await acces(evt(TOK))).body, vG = JSON.parse(bG);
  ok('gérant → gere:true de tête', vG.gere === true);
  ok('gérant → chaque entrée porte un code (valeur)', vG.acces.length > 0 && vG.acces.every(x => typeof x.code === 'string'));
  ok('⛔ forme GÉRANT (6 clés) : aucun id de contact (ni clé id, ni valeur) dans la réponse', sansId(bG, vG.acces));
  const bM = (await acces(evt(signer(MID).token))).body, vM = JSON.parse(bM);
  ok('non-gérant → gere:false de tête', vM.gere === false);
  ok('⛔ non-gérant → AUCUNE entrée ne porte de code', vM.acces.every(x => !Object.prototype.hasOwnProperty.call(x, 'code')));
  ok('⛔ forme SIMPLE (5 clés) : aucun id de contact dans la réponse', sansId(bM, vM.acces));

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
