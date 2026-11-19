// netlify/functions/_authclient.js
// Lot G tranche 1 — AUTHENTIFICATION CLIENT, strictement séparée de l'équipe. Duplication ASSUMÉE du
// patron de _auth.js (PAS de factorisation : la porte des sept — notion.js/_auth.js/login.js — ne bouge
// pas). Un contact client vit dans « 👤 Contacts Client » (jamais dans 👥 Équipe) → un client ne peut
// JAMAIS devenir membre, et un identifiant client présenté au proxy équipe échoue (absent d'Équipe).
//
// Identifiant = Mail ; secret = Code acces ; périmètre = Code Brand (dénormalisé, validé en aval par
// _perimetreclient). Base lue en entier puis match EN MÉMOIRE (cache 60 s), comme _auth.getMembres.
// L'id de la base vient de l'env DB_CONTACTS_CLIENT (base neuve, provisionnée par l'ops ; absente →
// indispo, fail-closed). Cache par instance ; refresh-on-miss borné (code tout juste changé).
//
// Contrat de sortie (réserve 2) :
//   { ok:true, contact:{ id, mail, nom, codeBrand } }
//   { ok:false, raison:'auth' }    — identifiants refusés : MÊME réponse que le mail existe ou non
//                                     (zéro énumération). L'appelant rend un message GÉNÉRIQUE.
//   { ok:false, raison:'indispo' } — panne (env absente, Notion en erreur). L'appelant rend
//                                     « temporairement indisponible », distinct d'un refus d'identifiants.
// Jamais d'exception propagée.

const CACHE_TTL = 60 * 1000;
const FORCE_FLOOR = 10 * 1000;
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();         // mails
const normId = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase(); // ids Notion (tirets ignorés)

let _cache = null, _ts = 0, _lastForce = 0;

async function _getContacts(token, dbId, force) {
  const now = Date.now();
  if (!force && _cache && (now - _ts) < CACHE_TTL) return _cache;
  // Pagination RÉELLE : sans elle, au-delà de 100 contacts les suivants ne pourraient plus se connecter,
  // silencieusement. Appels Notion (pas des invocations Netlify), et seulement sur cache froid. Garde-fou
  // 20 pages (2000 contacts) comme apiQueryAll côté app.
  const all = [];
  let cursor = null, pages = 0;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('contacts query ' + r.status);
    const d = await r.json();
    all.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null;
    pages++;
  } while (cursor && pages < 20);
  // Borne atteinte = des contacts TOMBENT sans bruit (login refusé pour eux, ET absents de « Qui a accès » — un
  // client y verrait « mon collègue n'est pas là » sans aucun log). Journalisé (classe #251). ⛔ aucune valeur de code.
  if (cursor) console.error('_authclient : base contacts TRONQUÉE (borne 20 pages / 2000 atteinte) — des contacts manquent SANS BRUIT ; relever la borne.');
  _cache = all; _ts = now;
  return _cache;
}

// HYGIÈNE, PAS UN CORRECTIF DE BUG : on JOINT tous les runs rich_text, comme espace-client/montage-client,
// au lieu de ne lire que le premier. Rien de cassé aujourd'hui (B09 passe avec son mail auto-lié, prouvé) —
// c'est une mise en cohérence pour qu'une valeur un jour scindée en plusieurs runs ne soit pas tronquée.
const _rt = (pr, nom) => ((pr && pr[nom] && pr[nom].rich_text) || []).map(t => t.plain_text || '').join('');
const _mail = (pr) => (pr && pr['Mail'] && typeof pr['Mail'].email === 'string' && pr['Mail'].email) || _rt(pr, 'Mail'); // Mail email OU text
const _nom = (pr) => { const t = pr && pr['Nom'] && pr['Nom'].title; return (t && t[0] && t[0].plain_text) || ''; };
// Actif OPTIONNEL : propriété absente → actif ; présente et décochée → inactif (fail-closed sur un compte désactivé).
const _actif = (pr) => { const a = pr && pr['Actif']; return a ? !!a.checkbox : true; };
// « Peut gérer les accès » : MIROIR fail-closed de _actif. Propriété absente OU décochée → false. ⚠ L'asymétrie est
// VOULUE, ne pas l'« harmoniser » : _actif absent → true (un schéma manquant ne doit pas FERMER un espace), _gere
// absent → false (un schéma manquant ne doit pas OUVRIR un pouvoir). Les deux défauts vont dans le sens de la prudence.
const _gere = (pr) => { const a = pr && pr['Peut gérer les accès']; return !!(a && a.checkbox); };

// ── ACTIVATION DE L'ESPACE PAR MARQUE ───────────────────────────────────────────────────────────────────
// Drapeau PORTE : tant que la marque n'est pas activée, personne de cette marque n'entre (ferme d'un coup le
// trou des comptes de test aux identifiants devinables). Il vit sur 🏷️ Clients Brand (la MARQUE), case
// « Espace client activé ». Id EN DUR — PAS d'env var (une var de plus à oublier de scoper aux Functions,
// l'oubli exact qui a causé le 503 muet). VÉRIFIÉ : c'est 67abbb5f… « 🏷️ Clients Brand » (qui porte le
// `Code` marque), PAS 228c6efb… « 🏢 Clients Brand ». Cache 60 s comme les contacts.
const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
let _cbCache = null, _cbTs = 0;
const _codeOf = (pr) => _rt(pr, 'Code') || ((pr && pr['Code'] && pr['Code'].title && pr['Code'].title[0] && pr['Code'].title[0].plain_text) || '');

async function _getClientsBrand(token) {
  const now = Date.now();
  if (_cbCache && (now - _cbTs) < CACHE_TTL) return _cbCache;
  const all = [];
  let cursor = null, pages = 0;
  do {
    const body = { page_size: 100 }; if (cursor) body.start_cursor = cursor;
    const r = await fetch('https://api.notion.com/v1/databases/' + DB_CLIENTS_BRAND + '/query', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('clients brand query ' + r.status);
    const d = await r.json(); all.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null; pages++;
  } while (cursor && pages < 20);
  _cbCache = all; _cbTs = now;
  return _cbCache;
}

// marqueOuverte(codeBrand) → { ok:true, ouverte, series } | { ok:false, raison:'indispo' }.
// Fail-closed sur la DONNÉE (marque introuvable / case absente ou décochée → ouverte:false). Une PANNE
// (config/Notion) → 'indispo' et ne doit JAMAIS être traduite en « fermé » (Réserve 2 : ne pas dire au
// client « pas ouvert » quand c'est le service qui est tombé).
async function marqueOuverte(codeBrand, token) {
  const tok = token || process.env.NOTION_TOKEN;
  if (!tok) { console.error('marqueOuverte indispo : NOTION_TOKEN manquant'); return { ok: false, raison: 'indispo' }; }
  const code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!code) return { ok: true, ouverte: false, series: null }; // pas de marque sur le contact → fermé (donnée), pas une panne
  try {
    const rows = await _getClientsBrand(tok);
    const row = rows.find(p => _codeOf(p.properties).trim() === code);
    const ouverte = !!(row && row.properties && row.properties['Espace client activé'] && row.properties['Espace client activé'].checkbox === true);
    // ADDITIF (lot 2) : « Séries accordées » au niveau MARQUE = repli de la cascade carte→marque→5. Lu sur la
    // row DÉJÀ chargée pour la porte → zéro appel Notion en plus. Absent/non-number → null : l'appelant retombe
    // sur 5 (seriesAccordees), comme aujourd'hui. Jamais une garde, purement un défaut d'affichage.
    const sm = row && row.properties && row.properties['Séries accordées'] && row.properties['Séries accordées'].number;
    const series = (typeof sm === 'number') ? sm : null;
    return { ok: true, ouverte, series };
  } catch (e) {
    console.error('marqueOuverte indispo : ' + (e && e.message || ''));
    return { ok: false, raison: 'indispo' };
  }
}

async function verifyClient({ mail, code }) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) {
    // F5 : ce 503 était MUET (4 h de débogage le 24-25). Booléens de PRÉSENCE uniquement, aucune valeur.
    console.error('verifyClient indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')');
    return { ok: false, raison: 'indispo' };
  }
  const m = norm(mail);
  const c = String(code == null ? '' : code).trim(); // trim serveur : le navigateur n'est pas la seule porte (un espace collé ne doit pas refuser un code juste)
  if (!m || !c) return { ok: false, raison: 'auth' };
  try {
    const trouver = (liste) => liste.find(p => norm(_mail(p.properties)) === m && norm(_mail(p.properties)) !== '');
    const bon = (p) => !!p && _rt(p.properties, 'Code acces') === c && _actif(p.properties);
    let contacts = await _getContacts(token, dbId, false);
    let page = trouver(contacts);
    if (!bon(page) && (Date.now() - _lastForce > FORCE_FLOOR)) { // refresh-on-miss borné
      _lastForce = Date.now();
      contacts = await _getContacts(token, dbId, true);
      page = trouver(contacts);
    }
    if (!bon(page)) {
      // DIAGNOSTIC (logs serveur uniquement) : BOOLÉENS DE PRÉSENCE, jamais une valeur, jamais un fragment
      // de mail ni de code. La réponse HTTP reste le 401 générique anti-énumération ; ceci lève seulement
      // l'ambiguïté « mail non apparié » vs « code faux » vs « inactif » dans les logs, qu'on ne pouvait pas
      // distinguer (c'est ce trou qui a coûté une heure de fausse piste).
      console.error('verifyClient échec auth : mailApparié=' + (!!page) + ', codeApparié=' + (!!(page && _rt(page.properties, 'Code acces') === c)) + ', actif=' + (!!(page && _actif(page.properties))));
      return { ok: false, raison: 'auth' }; // mail inconnu / code faux / inactif → MÊME réponse HTTP
    }
    // `marque` = nom d'affichage DÉNORMALISÉ sur le contact (comme Code Brand), posé par l'admin en tranche 3
    // depuis la marque choisie, jamais tapé. Absent → '' (l'écran affiche « Vos projets » sans marque). Lu
    // sur la ligne déjà chargée → zéro requête supplémentaire, y compris sur le chemin chaud projets-client.
    return { ok: true, contact: { id: page.id, mail: m, nom: _nom(page.properties), codeBrand: _rt(page.properties, 'Code Brand'), marque: _rt(page.properties, 'Marque') } };
  } catch (e) {
    // ⛔ e.name seulement, jamais e.message : son try englobe _getContacts, qui parse une réponse portant TOUS
    //   les contacts ET leurs codes — un corps tronqué (Node 20+) mettrait un fragment, code compris, au journal.
    console.error('verifyClient indispo (' + (e && e.name || 'Error') + ')');
    return { ok: false, raison: 'indispo' };
  }
}

// F1 — relecture LIVE par id (jeton de session). Même base, même cache 60 s que verifyClient, mais clé = id
// du contact (tiré du jeton), PAS mail+code. Sert à projets-client : vérifier Actif (révocation ~60 s) et
// récupérer le Code Brand courant. → { ok:true, codeBrand, marque, seriesMarque } | { ok:false, raison:'auth'|'ferme'|'indispo' }.
//   'ferme' = contact OK mais espace de la marque fermé (distinct de 'auth' = contact disparu/désactivé).
//   Les appelants client ne branchent que sur 'indispo' ; pour eux 'ferme' se comporte comme 'auth' (→ 401).
//   'auth'    = contact disparu ou désactivé → le jeton ne vaut plus → l'appelant renvoie 401 (re-login).
//   'indispo' = config/Notion → 503.
async function contactActif(id) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) {
    console.error('contactActif indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')');
    return { ok: false, raison: 'indispo' };
  }
  const want = normId(id);
  if (!want) return { ok: false, raison: 'auth' };
  try {
    const trouver = (liste) => liste.find(p => normId(p.id) === want);
    const vivant = (p) => !!p && _actif(p.properties);
    let contacts = await _getContacts(token, dbId, false);
    let page = trouver(contacts);
    if (!vivant(page) && (Date.now() - _lastForce > FORCE_FLOOR)) { // refresh-on-miss borné (désactivation récente)
      _lastForce = Date.now();
      contacts = await _getContacts(token, dbId, true);
      page = trouver(contacts);
    }
    if (!vivant(page)) return { ok: false, raison: 'auth' }; // disparu / désactivé → re-login
    // GARDE D'ACTIVATION (recheck live) : l'espace de la MARQUE doit être OUVERT. Fermé → 'auth' : l'appelant
    // renvoie 401, le client retombe au login, qui affiche le message « pas encore ouvert » (le message vit à
    // UN seul endroit). Panne du lookup → 'indispo' (jamais « fermé » sur une panne). Évince en ~60 s un jeton
    // émis avant une désactivation.
    const codeBrand = _rt(page.properties, 'Code Brand');
    const act = await marqueOuverte(codeBrand, token);
    if (!act.ok) return { ok: false, raison: 'indispo' };
    // Marque FERMÉE → raison DISTINCTE de 'auth' (contact disparu/désactivé). Les cinq appelants client ne
    // branchent que sur 'indispo' (le reste → 401), donc 'ferme' leur est invisible : aucun changement de
    // comportement côté client. Seul le mint d'emprunt la distingue, pour ne pas dire « marque fermée » quand
    // c'est le contact qui est révoqué (sinon David chercherait une case déjà cochée).
    if (!act.ouverte) return { ok: false, raison: 'ferme' };
    // `nom` ajouté (tranche 2) : estampillage SERVEUR de l'Auteur d'un retour depuis la fiche lue EN LIVE
    // (montage-client ne fait jamais confiance au navigateur pour l'auteur). Additif — projets-client l'ignore.
    // `seriesMarque` ajouté (lot 2) : défaut marque de la cascade carte→marque→5, relayé depuis marqueOuverte
    // (row déjà lue pour la porte). null si absent. Additif — les appelants qui l'ignorent ne voient rien changer.
    // `gere` ajouté (lot « gérer les accès ») : la case « Peut gérer les accès » de l'appelant, lue sur la ligne DÉJÀ
    // chargée. Additif — les appelants qui l'ignorent ne voient rien changer. Défaut false (cf. _gere).
    return { ok: true, nom: _nom(page.properties), codeBrand, marque: _rt(page.properties, 'Marque'), seriesMarque: act.series, gere: _gere(page.properties) };
  } catch (e) {
    console.error('contactActif indispo (' + (e && e.name || 'Error') + ')'); // ⛔ e.name seul (try englobe _getContacts = les codes)
    return { ok: false, raison: 'indispo' };
  }
}

// premierContactActif(codeBrand) → { ok:true, contact:{ id, nom } } | { ok:false, raison:'aucun'|'indispo' }.
// Choisit UN contact ACTIF d'une marque, de façon DÉTERMINISTE (tri par Nom, départage par id) — pour la
// 2ᵉ porte d'emprunt « Voir incognito » depuis une carte, quand aucun client n'a encore commenté. Réutilise
// le MÊME cache 60 s que verifyClient/contactActif (aucune requête de plus). Ne vérifie PAS la marque ouverte :
// c'est contactActif (appelé ensuite par le mint) qui porte cette garde — on ne la duplique pas ici.
async function premierContactActif(codeBrand) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) {
    console.error('premierContactActif indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')');
    return { ok: false, raison: 'indispo' };
  }
  const code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!code) return { ok: false, raison: 'aucun' };
  try {
    const contacts = await _getContacts(token, dbId, false);
    const actifs = (contacts || [])
      .filter(p => _rt(p.properties, 'Code Brand').trim() === code && _actif(p.properties))
      .map(p => ({ id: p.id, nom: _nom(p.properties) }));
    if (!actifs.length) return { ok: false, raison: 'aucun' };
    // Déterministe : par Nom (locale FR), puis par id (jamais d'ambiguïté si deux noms identiques).
    actifs.sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr') || normId(a.id).localeCompare(normId(b.id)));
    return { ok: true, contact: actifs[0] };
  } catch (e) {
    console.error('premierContactActif indispo (' + (e && e.name || 'Error') + ')'); // ⛔ e.name seul (try englobe _getContacts = les codes)
    return { ok: false, raison: 'indispo' };
  }
}

// adminClients() → { ok:true, marques:[…], contacts:[…] } | { ok:false, raison:'indispo' }.
// Données de l'écran d'admin clients (lot 3, LECTURE SEULE). Réutilise les DEUX caches 60 s existants
// (_getClientsBrand + _getContacts) → 0 requête à chaud, 2 à froid. NE MAPPE QUE des champs sûrs :
// ⛔ JAMAIS 'Code acces' (ni lu, ni renvoyé — comme le proxy équipe le strippe). Aucune écriture.
async function adminClients() {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('adminClients indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { ok: false, raison: 'indispo' }; }
  try {
    const [rows, contacts] = await Promise.all([_getClientsBrand(token), _getContacts(token, dbId, false)]);
    const _num = (pr, nom) => { const n = pr && pr[nom] && pr[nom].number; return (typeof n === 'number') ? n : null; };
    const _titre = (pr, nom) => { const t = pr && pr[nom] && pr[nom].title; return (t && t[0] && t[0].plain_text) || ''; };
    const marques = (rows || []).map(p => {
      const pr = p.properties || {};
      return {
        code: _codeOf(pr).trim(),
        nom: _titre(pr, 'Client'),
        ouverte: !!(pr['Espace client activé'] && pr['Espace client activé'].checkbox === true),
        series: _num(pr, 'Séries accordées'),   // null si vide → l'écran affiche « 5 (par défaut) »
        nbProjets: _num(pr, 'Nb projets')
      };
    });
    const contactsSafe = (contacts || []).map(p => ({
      codeBrand: _rt(p.properties, 'Code Brand').trim(),
      nom: _nom(p.properties),
      mail: _mail(p.properties),
      actif: _actif(p.properties)
      // ⛔ pas de 'Code acces' : jamais lu ici, jamais renvoyé.
    }));
    return { ok: true, marques, contacts: contactsSafe };
  } catch (e) {
    console.error('adminClients indispo (' + (e && e.name || 'Error') + ')'); // ⛔ e.name seul (try englobe _getContacts = les codes)
    return { ok: false, raison: 'indispo' };
  }
}

// accesClient(codeBrand, callerId, gere) → { ok:true, acces:[{ nom, mail, actif, aCode, moi[, code] }] } | { ok:false, raison:'indispo' }.
// Écran client « Qui a accès » (LECTURE SEULE), BORNÉ au Code Brand de l'appelant. Réutilise le cache _getContacts
// (0 requête à chaud). ⛔ aCode = BOOLÉEN (présence d'un code), JAMAIS la valeur, JAMAIS la longueur.
// moi = BOOLÉEN : cette ligne est-elle celle de l'appelant ? Le serveur tranche par comparaison d'id ; ⛔ on ne
// renvoie JAMAIS l'id d'un contact au navigateur. callerId nul (ex. session d'emprunt ro) → moi FALSE sur TOUTES
// les lignes, par un garde EXPLICITE — pas en se reposant sur le fait que normId('') ne collisionne aucun id.
// gere = BOOLÉEN (case « Peut gérer les accès » de l'appelant) : s'il est VRAI, chaque entrée porte EN PLUS `code`
// (la valeur, visible par un gérant — décision David : « rien de secret entre gens qui travaillent ensemble »).
// ⛔ NOUVELLE FRONTIÈRE : si gere n'est pas strictement true, `code` n'est JAMAIS posé, sous aucune circonstance.
async function accesClient(codeBrand, callerId, gere) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('accesClient indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { ok: false, raison: 'indispo' }; }
  const code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!code) return { ok: true, acces: [] }; // pas de marque sur l'appelant → liste vide (donnée, pas une panne)
  const moiId = callerId ? normId(callerId) : null; // ⛔ garde explicite : callerId nul → aucune ligne « moi »
  const avecCode = gere === true;                   // ⛔ code visible UNIQUEMENT pour un gérant ; sinon JAMAIS
  try {
    const contacts = await _getContacts(token, dbId, false);
    const acces = (contacts || [])
      .filter(p => _rt(p.properties, 'Code Brand').trim() === code)   // ⛔ cloisonnement : jamais une autre marque
      .map(p => {
        const e = {
          nom: _nom(p.properties),
          mail: _mail(p.properties),
          actif: _actif(p.properties),
          aCode: _rt(p.properties, 'Code acces').length > 0,         // ⛔ BOOLÉEN seul — ni la valeur, ni la longueur
          moi: moiId !== null && normId(p.id) === moiId              // ⛔ booléen (jamais l'id) ; faux partout si callerId nul
        };
        if (avecCode) e.code = _rt(p.properties, 'Code acces');      // ⛔ valeur de code : seulement si l'appelant gère
        return e;
      });
    return { ok: true, acces };
  } catch (e) {
    console.error('accesClient indispo (' + (e && e.name || 'Error') + ')'); // ⛔ e.name seul (try englobe _getContacts = les codes)
    return { ok: false, raison: 'indispo' };
  }
}

// statutAjoutMail(codeBrand, mail) → { ok:true, statut:'libre'|'memeMarque'|'ailleurs' } | { ok:false, raison:'indispo' }.
// Unicité du mail AVANT un ajout : trouver() (login) rend le PREMIER contact au mail — deux mails identiques et le
// second ne peut PLUS se connecter, en silence. Donc le refus est obligatoire. La distinction se décide d'un SEUL
// scan en mémoire (contacts cachés), AUCUNE I/O dépendante de la branche → pas de canal temporel. ⛔ C'est la ROUTE
// qui mappe 'ailleurs' sur un refus GÉNÉRIQUE : on ne révèle jamais l'existence d'un contact d'une autre marque.
async function statutAjoutMail(codeBrand, mail) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('statutAjoutMail indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { ok: false, raison: 'indispo' }; }
  const m = norm(mail), code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!m) return { ok: true, statut: 'libre' }; // mail vide : refusé par la validation de la route, pas ici
  try {
    const contacts = await _getContacts(token, dbId, false);
    let memeMarque = false, ailleurs = false;
    for (const p of (contacts || [])) {
      if (norm(_mail(p.properties)) !== m) continue;
      if (_rt(p.properties, 'Code Brand').trim() === code) memeMarque = true; else ailleurs = true;
    }
    return { ok: true, statut: memeMarque ? 'memeMarque' : (ailleurs ? 'ailleurs' : 'libre') };
  } catch (e) {
    console.error('statutAjoutMail indispo (' + (e && e.name || 'Error') + ')');
    return { ok: false, raison: 'indispo' };
  }
}

// baseCode(marque, nom) : 3 lettres de la marque, un point, 3 lettres du DERNIER mot du nom. Capitales, accents et
// non-lettres retirés (Refashion + « Maria Oliveira » → REF.OLI). PUR, benchable sans I/O. ⛔ format humain, distinct
// du générateur aléatoire du self-service (code-reset) — ils n'ont pas à s'accorder. Repli : si une partie n'a pas
// 3 lettres, on prend ce qu'il y a (code plus court) ; marque sans lettre → préfixe vide (cas dégénéré, non bloquant).
const _lettres = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
function baseCode(marque, nom) {
  const mk = _lettres(marque).slice(0, 3);
  const mots = String(nom == null ? '' : nom).trim().split(/\s+/);
  const dernier = _lettres(mots[mots.length - 1] || '').slice(0, 3);
  return mk + '.' + dernier;
}
// genererCodeAcces(marque, nom, codesExistants) : baseCode, puis suffixe numérique sur COLLISION (REF.OLI, REF.OLI2…)
// contre les codes DÉJÀ présents dans la marque (actifs ET inactifs). PUR. Une course concurrente retombe au pire sur
// deux codes identiques — exactement la situation sans suffixe, acceptable.
function genererCodeAcces(marque, nom, codesExistants) {
  const base = baseCode(marque, nom);
  const pris = new Set((codesExistants || []).map(c => String(c == null ? '' : c)));
  if (!pris.has(base)) return base;
  for (let n = 2; ; n++) { const cand = base + n; if (!pris.has(cand)) return cand; }
}

// trouverCible(codeBrand, mail) → { ok:true, id } | { ok:false, raison:'absent'|'ambigu'|'indispo' }.
// Résout la page cible d'un retrait/redonner CÔTÉ SERVEUR, depuis _getContacts. ⛔ La requête ne fournit JAMAIS d'id
// de page : on ne peut pas viser une autre marque via un id forgé — plus fort que « GET + revérif parent », il n'y a
// aucun id de requête à croire. L'id rendu est INTERNE (à PATCHer), ne transite jamais par le navigateur.
//   ⛔ (1) ON FILTRE SUR LA MARQUE D'ABORD, puis on cherche le mail DEDANS. Sinon « pas trouvé » vs « pas ta marque »
//          serait un oracle d'existence sur une AUTRE marque. Hors-marque = inexistant : MÊME chemin, MÊME refus.
//   ⛔ (2) FAIL-CLOSED sur l'ambiguïté : deux lignes de la marque au même mail → REFUS, jamais un choix arbitraire
//          (la base est éditable à la main ; mieux vaut refuser qu'écrire sur la mauvaise personne).
// La ROUTE mappe 'absent' ET 'ambigu' sur le MÊME 403 (indiscernables côté client).
async function trouverCible(codeBrand, mail) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('trouverCible indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { ok: false, raison: 'indispo' }; }
  const m = norm(mail), code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!m || !code) return { ok: false, raison: 'absent' };
  try {
    const contacts = await _getContacts(token, dbId, false);
    const dansMarque = (contacts || []).filter(q => _rt(q.properties, 'Code Brand').trim() === code); // (1) marque D'ABORD
    const matches = dansMarque.filter(q => norm(_mail(q.properties)) === m);                            //     mail DEDANS
    if (matches.length === 0) return { ok: false, raison: 'absent' };
    if (matches.length > 1) return { ok: false, raison: 'ambigu' };                                     // (2) fail-closed
    return { ok: true, id: matches[0].id };
  } catch (e) {
    console.error('trouverCible indispo (' + (e && e.name || 'Error') + ')');
    return { ok: false, raison: 'indispo' };
  }
}

// adminsMarque(codeBrand) → { ok:true, existe, noms } | { ok:false, raison:'indispo' }.
// Lot « validation réservée ». existe = AU MOINS un porteur de « Peut gérer les accès » dans la marque, ACTIFS ET
// INACTIFS comptés — repli fail-closed : désactiver l'unique admin BLOQUE la validation, ne la rouvre pas en silence.
// noms = les porteurs ACTIFS seulement (eux seuls peuvent agir), CAPÉS : la liste si 1..3, sinon [] (0 ou >3 → phrase
// générique). ⛔ noms seuls — jamais mail/code/id. Réutilise le cache _getContacts (0 requête à chaud : contactActif
// l'a déjà réchauffé juste avant, dans la même invocation). Un ÉCHEC ici (Notion indispo) → { ok:false } : l'appelant
// DOIT fail-closed (refuser la validation), mais avec un message et un code DISTINCTS du refus « pas administrateur ».
async function adminsMarque(codeBrand) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('adminsMarque indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { ok: false, raison: 'indispo' }; }
  const code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!code) return { ok: true, existe: false, noms: [] }; // pas de marque → repli (tout le monde valide)
  try {
    const contacts = await _getContacts(token, dbId, false);
    const porteurs = (contacts || []).filter(p => _rt(p.properties, 'Code Brand').trim() === code && _gere(p.properties)); // actifs ET inactifs
    const actifs = porteurs.filter(p => _actif(p.properties)).map(p => _nom(p.properties)).filter(Boolean);
    const noms = (actifs.length >= 1 && actifs.length <= 3) ? actifs : []; // affichés : 1..3 nommés, sinon générique
    return { ok: true, existe: porteurs.length > 0, noms };
  } catch (e) {
    console.error('adminsMarque indispo (' + (e && e.name || 'Error') + ')');
    return { ok: false, raison: 'indispo' };
  }
}

// phraseValidation(noms, marque) : UNE forme, quatre remplissages (décision David). ⛔ Aucun genre, aucun point médian.
// L'exclusivité est portée par « revient à » ; le cas générique est le MÊME gabarit avec « un administrateur de … ».
const phraseValidation = (noms, marque) => {
  const n = (noms || []).filter(Boolean);
  let cible;
  if (n.length === 1) cible = n[0];
  else if (n.length === 2) cible = n[0] + ' ou ' + n[1];
  else if (n.length === 3) cible = n[0] + ', ' + n[1] + ' ou ' + n[2];
  else cible = 'un administrateur de ' + (String(marque == null ? '' : marque).trim() || 'votre société');
  return 'La validation revient à ' + cible + '.';
};
// Message du refus « on n'a pas pu vérifier » — DISTINCT de la phrase des noms, et servi avec un code 503 (pas 403).
const MSG_VALIDATION_INDISPO = 'La validation est momentanément indisponible, réessayez dans un instant.';

module.exports = { verifyClient, contactActif, marqueOuverte, premierContactActif, adminClients, accesClient, statutAjoutMail, baseCode, genererCodeAcces, trouverCible, adminsMarque, phraseValidation, MSG_VALIDATION_INDISPO };
