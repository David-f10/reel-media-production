// netlify/functions/notion.js — proxy Notion.
// LIVRAISON 2/3 (accès externes) : la porte principale est désormais VERROUILLÉE.
//   • Identité exigée : chaque appel de l'app porte (x-rm-id, x-rm-code) → verifyUser (_auth.js,
//     cache 60 s, AUCUN stockage par appel). Pas de jeton : le code ne coûte ni Blobs ni expiration
//     (l'app est sous alerte de conso Netlify), et aucune déconnexion en cours de session.
//   • Liste blanche stricte : seules les 3 familles réellement appelées, en GET/POST/PATCH.
//     PUT, DELETE, et tout autre chemin (/users, /blocks, /search, GET /databases nu…) → refus.
//   • Période de grâce review : un appel SANS identité n'est permis QUE pour les 4 opérations de
//     review.html (lien client public, sans compte) — ni plus, ni moins. Les liens déjà envoyés
//     continuent de marcher. Cette exposition (lecture prod + retours, dépôt retour, statut) est
//     celle d'AUJOURD'HUI ; elle sera refermée en 2/3b par des liens signés. Ici on ne l'élargit pas.
//   • Garde anti self-promotion : aucun PATCH ne peut poser une propriété d'élévation (Role/Accès).
//   • Projection de sécurité (1/3) conservée : 'Code acces' retiré de toute page renvoyée.
//   • FAIL-CLOSED : le seul mode de défaillance est le REFUS, jamais le passage, jamais un 200 vide.

const { verifyUser } = require('./_auth');

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

// Vérifie (côté serveur) qu'une page appartient à DB_PROD, en la relisant. Sert à borner le PATCH
// 'Statut' de la grâce review à DB_PROD (sinon un anonyme poserait un Statut sur une tâche/idée, qui
// ont aussi une propriété Statut). FAIL-CLOSED : toute erreur/absence de parent → false → refus.
async function pageDansProd(pageId, token) {
  try {
    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    });
    if (!r.ok) return false;
    const p = await r.json();
    return !!(p && p.parent && norm(p.parent.database_id) === norm(DB_PROD));
  } catch (e) {
    return false;
  }
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
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
    // Aucune identité : on n'autorise QUE les 4 opérations EXACTES de review.html (grâce). Rien d'autre.
    let autorise = false;
    if (route.kind === 'query') {
      // Lecture d'un sujet / de ses retours.
      autorise = norm(route.dbId) === norm(DB_PROD) || norm(route.dbId) === norm(DB_RETOURS);
    } else if (route.kind === 'create') {
      // Dépôt d'un retour (page dans DB_RETOURS).
      autorise = !!(body && body.parent && norm(body.parent.database_id) === norm(DB_RETOURS));
    } else if (route.kind === 'page' && method === 'PATCH') {
      // PATCH du SEUL 'Statut', ET uniquement sur une page de DB_PROD (relecture serveur).
      const props = body && body.properties;
      const keys = props && typeof props === 'object' ? Object.keys(props) : [];
      if (keys.length === 1 && keys[0] === 'Statut') {
        autorise = await pageDansProd(route.pageId, NOTION_TOKEN);
      }
    }
    if (!autorise) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentification requise' }) };
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
