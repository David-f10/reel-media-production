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
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

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

const _rt = (pr, nom) => { const rt = pr && pr[nom] && pr[nom].rich_text; return (rt && rt[0] && rt[0].plain_text) || ''; };
const _mail = (pr) => (pr && pr['Mail'] && typeof pr['Mail'].email === 'string' && pr['Mail'].email) || _rt(pr, 'Mail'); // Mail email OU text
const _nom = (pr) => { const t = pr && pr['Nom'] && pr['Nom'].title; return (t && t[0] && t[0].plain_text) || ''; };
// Actif OPTIONNEL : propriété absente → actif ; présente et décochée → inactif (fail-closed sur un compte désactivé).
const _actif = (pr) => { const a = pr && pr['Actif']; return a ? !!a.checkbox : true; };

async function verifyClient({ mail, code }) {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) return { ok: false, raison: 'indispo' };
  const m = norm(mail);
  const c = String(code == null ? '' : code);
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
    if (!bon(page)) return { ok: false, raison: 'auth' }; // mail inconnu / code faux / inactif → MÊME réponse
    return { ok: true, contact: { id: page.id, mail: m, nom: _nom(page.properties), codeBrand: _rt(page.properties, 'Code Brand') } };
  } catch (e) {
    console.error('verifyClient indispo : ' + (e && e.message || ''));
    return { ok: false, raison: 'indispo' };
  }
}

module.exports = { verifyClient };
