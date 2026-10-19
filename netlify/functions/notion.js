// netlify/functions/notion.js — proxy Notion.
// LIVRAISON 2/3 (accès externes) : la porte principale est désormais VERROUILLÉE.
//   • Identité exigée : chaque appel de l'app porte (x-rm-id, x-rm-code) → verifyUser (_auth.js,
//     cache 60 s, AUCUN stockage par appel). Pas de jeton : le code ne coûte ni Blobs ni expiration
//     (l'app est sous alerte de conso Netlify), et aucune déconnexion en cours de session.
//   • Liste blanche stricte : seules les 3 familles réellement appelées, en GET/POST/PATCH.
//     PUT, DELETE, et tout autre chemin (/users, /blocks, /search, GET /databases nu…) → refus.
//   • Review (2/3b-1) : un appel SANS identité n'est permis que porteur d'un JETON de review signé
//     (x-review-token), lié à UN sujet, et chaque opération est bornée à ce sujet (query Code=…,
//     query/POST/PATCH Sujet ID=…). Pas de grâce : aucune lecture anonyme de masse, un lien forgé
//     (code deviné, sans signature valide) est refusé.
//   • Garde anti self-promotion : aucun PATCH ne peut poser une propriété d'élévation (Role/Accès).
//   • Projection de sécurité (1/3) conservée : 'Code acces' retiré de toute page renvoyée.
//   • FAIL-CLOSED : le seul mode de défaillance est le REFUS, jamais le passage, jamais un 200 vide.

const { verifyUser } = require('./_auth');
const { verifyReview } = require('./_review');

// Ids utiles à la grâce review (review.html ne tape que ces deux bases via le proxy).
const DB_PROD    = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';

// Propriétés d'ÉLÉVATION : leur écriture par PATCH n'est JAMAIS permise via le proxy. Aucun flux
// légitime ne les modifie par PATCH (le rôle n'est posé qu'à la CRÉATION d'un membre, par POST).
// Les bloquer ferme le self-promotion (un externe se repasse en Complet depuis la console) sans
// rien casser aujourd'hui. 'Accès'/'Acces' : le champ de niveau d'accès prévu pour la 3/3.
const PROPS_ELEVATION = ['Role', 'Accès', 'Acces'];

// Comparaison d'ids Notion tolérante aux tirets (dashed 36 car. ↔ dashless 32 car.).
const norm = (s) => String(s || '').replace(/-/g, '').toLowerCase();

// Classe le `path` en l'une des 3 familles réellement appelées, en vérifiant la méthode.
// Retourne null (→ refus) pour tout le reste : aucun GET /databases nu, pas de PUT/DELETE.
function classer(method, path) {
  const p = String(path || '').split('?')[0];
  let m;
  if (p === '/pages') return method === 'POST' ? { kind: 'create' } : null;
  if ((m = p.match(/^\/pages\/([0-9a-fA-F-]{32,36})$/))) {
    return (method === 'GET' || method === 'PATCH') ? { kind: 'page', pageId: m[1] } : null;
  }
  if ((m = p.match(/^\/databases\/([0-9a-fA-F-]{32,36})\/query$/))) {
    return method === 'POST' ? { kind: 'query', dbId: m[1] } : null;
  }
  return null;
}

// Extrait la valeur de la condition 'Sujet ID' d'un filtre de query DB_RETOURS, qu'il soit simple
// ({property:'Sujet ID', rich_text:{equals:X}}) ou composé ({and:[… , {property:'Sujet ID', …}]}) —
// les deux formes émises par review.html (chargerTousRetours + son repli). Renvoie X ou null.
function filtreSujetId(filter) {
  if (!filter || typeof filter !== 'object') return null;
  if (filter.property === 'Sujet ID') return (filter.rich_text && filter.rich_text.equals) || null;
  if (Array.isArray(filter.and)) {
    const c = filter.and.find(x => x && x.property === 'Sujet ID');
    return c ? ((c.rich_text && c.rich_text.equals) || null) : null;
  }
  return null;
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code, x-review-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'NOTION_TOKEN manquant' }) };
  }

  const method = event.httpMethod;
  const path = event.queryStringParameters?.path || '';

  // ── 1. Liste blanche méthode + chemin (fail-closed) ───────────────────────
  const route = classer(method, path);
  if (!route) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Endpoint non autorisé' }) };
  }

  // Corps parsé une seule fois. Un corps illisible sur une écriture → refus (jamais de passage).
  let body = null;
  if ((method === 'POST' || method === 'PATCH') && event.body) {
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Corps JSON invalide' }) }; }
  }

  // ── 2. Identité (en-têtes) → verifyUser (cache 60 s, aucun stockage par appel) ──
  const rid   = (event.headers && (event.headers['x-rm-id']   || event.headers['X-Rm-Id']))   || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  let user = null;
  if (rid && rcode) {
    const auth = await verifyUser({ id: rid, code: rcode });
    if (!auth.ok) {
      // Identité FOURNIE mais invalide → refus franc. Jamais un 200 vide : api() DOIT lever.
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Identité invalide' }) };
    }
    user = auth.user;
  }

  // ── 3. Autorisation ───────────────────────────────────────────────────────
  if (!user) {
    // Aucune identité équipe → on EXIGE un jeton de review signé (x-review-token), lié à UN sujet,
    // et on borne chaque opération à CE sujet. Plus de lecture anonyme de masse (porte 1), et un lien
    // fabriqué à la main sans signature valide est refusé (porte 2). Aucune grâce : aucun lien n'a
    // jamais été diffusé, on ferme complètement dès le 1er déploiement.
    const rtok = (event.headers && (event.headers['x-review-token'] || event.headers['X-Review-Token'])) || '';
    const rev = verifyReview(rtok); // { ok, code, sujetId } — fail-closed
    if (!rev.ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentification requise' }) };
    }
    let autorise = false;
    if (route.kind === 'query' && norm(route.dbId) === norm(DB_PROD)) {
      // init() : filtre Code = code DU JETON, exactement (un jeton pour A ne lit pas B).
      const f = body && body.filter;
      autorise = !!(f && f.property === 'Code' && f.rich_text && f.rich_text.equals === rev.code);
    } else if (route.kind === 'query' && norm(route.dbId) === norm(DB_RETOURS)) {
      // chargerTousRetours() : le filtre doit porter 'Sujet ID' = sujetId DU JETON.
      const sid = filtreSujetId(body && body.filter);
      autorise = !!sid && norm(sid) === norm(rev.sujetId);
    } else if (route.kind === 'create') {
      // Dépôt d'un retour : page dans DB_RETOURS, propriété 'Sujet ID' = sujetId DU JETON.
      const sid = body && body.properties && body.properties['Sujet ID'] && body.properties['Sujet ID'].rich_text
        && body.properties['Sujet ID'].rich_text[0] && body.properties['Sujet ID'].rich_text[0].text
        && body.properties['Sujet ID'].rich_text[0].text.content;
      autorise = !!(body && body.parent && norm(body.parent.database_id) === norm(DB_RETOURS) && sid && norm(sid) === norm(rev.sujetId));
    } else if (route.kind === 'page' && method === 'PATCH') {
      // PATCH du SEUL 'Statut', ET uniquement sur LE sujet du jeton (id de page = sujetId du jeton).
      const props = body && body.properties;
      const keys = props && typeof props === 'object' ? Object.keys(props) : [];
      autorise = norm(route.pageId) === norm(rev.sujetId) && keys.length === 1 && keys[0] === 'Statut';
    }
    if (!autorise) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Hors périmètre du lien' }) };
    }
  } else {
    // Identifié : garde anti self-promotion — aucun PATCH ne pose une propriété d'élévation.
    if (method === 'PATCH' && body && body.properties && typeof body.properties === 'object') {
      for (const k of PROPS_ELEVATION) {
        if (Object.prototype.hasOwnProperty.call(body.properties, k)) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Modification non autorisée' }) };
        }
      }
    }
    // Hook 3/3 : quand verifyUser renverra le niveau d'accès, borner ICI les écritures des externes
    // (création de membre, écriture hors périmètre) selon user.acces. Rien à activer tant que le
    // champ Accès n'existe pas — mais le point d'ancrage est posé, comme demandé avant la 3/3.
  }

  // ── 4. Relais Notion + projection de sécurité (1/3, inchangée) ────────────
  const url = `https://api.notion.com/v1${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: (method === 'POST' || method === 'PATCH') ? event.body : undefined
    });

    const data = await response.json();

    // Projection : on RETIRE 'Code acces' de toute page renvoyée (liste ET page unique).
    // SUPPRESSION de la clé, générique sur le nom, sans try/catch qui laisserait passer du brut.
    const PROP_SECRETE = 'Code acces';
    const retirerPropSecrete = (page) => {
      if (page && typeof page === 'object' && page.properties && typeof page.properties === 'object') {
        delete page.properties[PROP_SECRETE];
      }
    };
    if (data && typeof data === 'object') {
      if (Array.isArray(data.results)) data.results.forEach(retirerPropSecrete);
      if (data.properties) retirerPropSecrete(data);
    }

    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
