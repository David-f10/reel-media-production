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

// marqueOuverte(codeBrand) → { ok:true, ouverte } | { ok:false, raison:'indispo' }.
// Fail-closed sur la DONNÉE (marque introuvable / case absente ou décochée → ouverte:false). Une PANNE
// (config/Notion) → 'indispo' et ne doit JAMAIS être traduite en « fermé » (Réserve 2 : ne pas dire au
// client « pas ouvert » quand c'est le service qui est tombé).
async function marqueOuverte(codeBrand, token) {
  const tok = token || process.env.NOTION_TOKEN;
  if (!tok) { console.error('marqueOuverte indispo : NOTION_TOKEN manquant'); return { ok: false, raison: 'indispo' }; }
  const code = String(codeBrand == null ? '' : codeBrand).trim();
  if (!code) return { ok: true, ouverte: false }; // pas de marque sur le contact → fermé (donnée), pas une panne
  try {
    const rows = await _getClientsBrand(tok);
    const row = rows.find(p => _codeOf(p.properties).trim() === code);
    const ouverte = !!(row && row.properties && row.properties['Espace client activé'] && row.properties['Espace client activé'].checkbox === true);
    return { ok: true, ouverte };
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
    console.error('verifyClient indispo : ' + (e && e.message || ''));
    return { ok: false, raison: 'indispo' };
  }
}

// F1 — relecture LIVE par id (jeton de session). Même base, même cache 60 s que verifyClient, mais clé = id
// du contact (tiré du jeton), PAS mail+code. Sert à projets-client : vérifier Actif (révocation ~60 s) et
// récupérer le Code Brand courant. → { ok:true, codeBrand, marque } | { ok:false, raison:'auth'|'indispo' }.
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
    if (!act.ouverte) return { ok: false, raison: 'auth' };
    // `nom` ajouté (tranche 2) : estampillage SERVEUR de l'Auteur d'un retour depuis la fiche lue EN LIVE
    // (montage-client ne fait jamais confiance au navigateur pour l'auteur). Additif — projets-client l'ignore.
    return { ok: true, nom: _nom(page.properties), codeBrand, marque: _rt(page.properties, 'Marque') };
  } catch (e) {
    console.error('contactActif indispo : ' + (e && e.message || ''));
    return { ok: false, raison: 'indispo' };
  }
}

module.exports = { verifyClient, contactActif, marqueOuverte };
