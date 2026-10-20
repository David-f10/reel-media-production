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
const { pageDansPerimetre, perimetreIds } = require('./_perimetre'); // 3/3b : cloisonnement externe

// Ids utiles à la grâce review (review.html ne tape que ces deux bases via le proxy).
const DB_PROD    = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';
const DB_EQUIPE  = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
// 3/3b : bases pour le cloisonnement d'un EXTERNE.
const DB_VERSIONS     = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const DB_COMMENTS     = '45fda8a6-dfbc-42c1-a26f-de09c289037b';
const DB_MUSIQUES     = 'd9d3579257bc49059e6cd683a8b02fef';
const DB_REFS         = '4ae84e174ee9473888eaa15112fcc6ee';
const DB_CORRECTIONS  = '9a3c2b06-69d4-4f04-a2bb-7a25b84209e1';
const DB_TACHES       = '0241d8dc-00a1-461c-9efa-00eb7e5fac70';
const DB_NOTIFS       = '4398775b-c11f-4d73-99c4-9fc31c33ce8b';
const DB_IDEES        = 'b164bf282a4e4ac78a15d5e894019daa';
const DB_COMP         = 'f9b8d090-6c9e-4513-a67c-db2d82941a29';
const DB_CLIENTS      = '228c6efb-eb59-42ef-8926-7ce34816cb96';
const DB_CLIENTS_BRAND= '67abbb5f-f6a6-4937-89e3-6c852c515a8e';

// Propriétés d'ÉLÉVATION : leur écriture par PATCH n'est JAMAIS permise via le proxy. Aucun flux
// légitime ne les modifie par PATCH (le rôle n'est posé qu'à la CRÉATION d'un membre, par POST).
// Les bloquer ferme le self-promotion (un externe se repasse en Complet depuis la console) sans
// rien casser aujourd'hui. 'Accès'/'Acces' : le champ de niveau d'accès prévu pour la 3/3.
// Propriétés d'ÉLÉVATION interdites en PATCH via le proxy (toute la logique d'accès passe par les
// fonctions dédiées access-set / code-reset, clé vérifiée). 'Peut gérer les accès' = la clé (3/3a).
const PROPS_ELEVATION = ['Role', 'Accès', 'Acces', 'Peut gérer les accès'];
// Sous-ensemble ACCÈS (sans Role) : interdit aussi à la CRÉATION d'un membre sauf porteur de la clé —
// sinon on forgerait depuis la console un membre neuf déjà en « gère les accès » (auto-promotion).
const PROPS_ACCES = ['Accès', 'Acces', 'Peut gérer les accès'];

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

// 3/3b : valeur texte d'une propriété rich_text d'une page renvoyée (forme lecture plain_text).
function rtVal(props, prop) {
  const rt = props && props[prop] && props[prop].rich_text;
  return (rt && rt[0] && rt[0].plain_text) || '';
}
// 3/3b : valeur de la propriété 'Sujet ID' d'une page (forme lecture plain_text OU écriture text.content).
function sidDeProps(props) {
  const rt = props && props['Sujet ID'] && props['Sujet ID'].rich_text;
  if (!rt || !rt[0]) return null;
  return rt[0].plain_text || (rt[0].text && rt[0].text.content) || null;
}
// 3/3b : relit une page pour connaître son 'Sujet ID' (sert à borner un PATCH sur une page cascade).
// FAIL-CLOSED : toute erreur → null → l'appelant refuse.
async function sujetIdDeLaPage(pageId, token) {
  try {
    const r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    });
    if (!r.ok) return null;
    const p = await r.json();
    return sidDeProps(p && p.properties);
  } catch (e) {
    return null;
  }
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
  // 3/3b : flags appliqués APRÈS le relai, pour le cloisonnement d'un externe (filtrage de la réponse
  // ou vérification d'une page unique). Restent nuls pour tout le monde sauf un externe.
  let filtreSortie = null;       // prédicat(page) → garde la page ; applique à data.results
  let verifPageExterne = false;  // GET d'une page : vérifier son périmètre après relai
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
      // Borne la RÉPONSE au serveur : un client ne reçoit QUE ses retours (Source='Client') et
      // JAMAIS un brouillon non validé (Brouillon=true). Les retours internes de l'équipe (sans
      // Source, ou brouillon en cours) ne descendent plus dans le navigateur. Filtrer à l'affichage
      // ne cloisonne pas ; ce filtre de SORTIE borne le payload et tient même si review.html change.
      // Même mécanisme que la branche Externe (filtreSortie). Effet voulu : quand l'équipe valide un
      // brouillon (validerTousRetours pose Brouillon:false), la demande devient visible du client.
      filtreSortie = (page) => {
        const p = page && page.properties;
        if (!p) return false;
        const src = p.Source && p.Source.select && p.Source.select.name;
        return src === 'Client' && !(p.Brouillon && p.Brouillon.checkbox);
      };
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
    // 3/3a : créer un membre d'équipe en posant Accès/clé est réservé aux porteurs de la clé.
    // (Le PATCH de ces champs est déjà interdit à tous par PROPS_ELEVATION → fonctions dédiées.)
    // Role à la création reste permis à tout membre (comportement actuel de « Ajouter »).
    if (method === 'POST' && route.kind === 'create'
        && body && body.parent && norm(body.parent.database_id) === norm(DB_EQUIPE)
        && body.properties && typeof body.properties === 'object'
        && PROPS_ACCES.some(k => Object.prototype.hasOwnProperty.call(body.properties, k))
        && !user.peutGererAcces) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Modification non autorisée' }) };
    }

    // ── 3/3b : CLOISONNEMENT EXTERNE ─────────────────────────────────────────
    // N'exécute QUE pour acces==='Externe' : le chemin Complet (les 7) est inchangé par construction.
    // FAIL-CLOSED partout : un doute refuse (jamais un 200 vide en guise de refus — les refus sont 403).
    if (user.acces === 'Externe') {
      const nom = user.nom;
      const dbId = route.dbId ? norm(route.dbId) : null;
      const CASCADE = [DB_RETOURS, DB_VERSIONS, DB_COMMENTS, DB_MUSIQUES, DB_REFS, DB_CORRECTIONS].map(norm);

      if (route.kind === 'query') {
        if (dbId === norm(DB_PROD)) {
          // Production : relai, puis filtre de sortie aux sujets du périmètre (incontournable, patron 1/3).
          filtreSortie = (page) => pageDansPerimetre(page, nom);
        } else if (CASCADE.includes(dbId)) {
          // Cascade : la query DOIT porter 'Sujet ID' = un sujet du périmètre.
          const sid = filtreSujetId(body && body.filter);
          let ids;
          try { ids = await perimetreIds(nom, NOTION_TOKEN); }
          catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'Périmètre indisponible' }) }; }
          if (!sid || !ids.has(norm(sid))) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
          }
        } else if (dbId === norm(DB_NOTIFS)) {
          // Ses notifications seulement (filtre de sortie Destinataire = lui — incontournable).
          filtreSortie = (page) => rtVal(page && page.properties, 'Destinataire') === nom;
        } else if (dbId === norm(DB_TACHES)) {
          // Ses tâches seulement (Assigné OU Créé par = lui).
          filtreSortie = (page) => {
            const p = page && page.properties;
            return rtVal(p, 'Assigné') === nom || rtVal(p, 'Créé par') === nom;
          };
        } else if (dbId === norm(DB_IDEES)) {
          // Ses idées seulement (Proposé par = lui) — pas tout le pipeline éditorial.
          filtreSortie = (page) => rtVal(page && page.properties, 'Proposé par') === nom;
        } else if (dbId === norm(DB_CLIENTS_BRAND) || dbId === norm(DB_CLIENTS) || dbId === norm(DB_COMP)) {
          // Roster clients / compteurs : un externe n'en a pas besoin (il ne crée pas de carte) → réponse
          // VIDE (pas 403 : appLoadData charge DB_COMP + DB_CLIENTS_BRAND et doit recevoir une réponse).
          filtreSortie = () => false;
        } else {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) }; // ex. DB_EQUIPE
        }
      } else if (route.kind === 'page' && method === 'GET') {
        verifPageExterne = true; // on ne connaît le type/périmètre de la page qu'après l'avoir lue
      } else if (route.kind === 'page' && method === 'PATCH') {
        // Écriture : un de SES sujets (DB_PROD), OU une page cascade dont le Sujet ID est au périmètre.
        let ids;
        try { ids = await perimetreIds(nom, NOTION_TOKEN); }
        catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'Périmètre indisponible' }) }; }
        if (!ids.has(norm(route.pageId))) {
          const sid = await sujetIdDeLaPage(route.pageId, NOTION_TOKEN);
          if (sid === null || !ids.has(norm(sid))) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
          }
        }
      } else if (route.kind === 'create') {
        // Pas de création de carte (DB_PROD) ni de membre (DB_EQUIPE) ; une page cascade à SON sujet.
        const parent = body && body.parent && norm(body.parent.database_id);
        if (parent === norm(DB_PROD) || parent === norm(DB_EQUIPE)) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
        }
        const sid = sidDeProps(body && body.properties);
        let ids;
        try { ids = await perimetreIds(nom, NOTION_TOKEN); }
        catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'Périmètre indisponible' }) }; }
        if (!sid || !ids.has(norm(sid))) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
        }
      }
    }
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

    // ── 3/3b : filtrage/vérif de sortie pour un externe (reste inerte pour les autres) ──
    if (filtreSortie && data && Array.isArray(data.results)) {
      data.results = data.results.filter(filtreSortie); // garde les pages du périmètre
    }
    if (verifPageExterne && user) {
      // GET d'une page par un externe : autorisé seulement si c'est un de ses sujets, ou une page cascade
      // dont le Sujet ID est au périmètre. Sinon 403 — on ne renvoie PAS la page. Fail-closed sur erreur.
      let dansPerim = false;
      try {
        if (data && data.parent && norm(data.parent.database_id) === norm(DB_PROD)) {
          dansPerim = pageDansPerimetre(data, user.nom);
        } else {
          const sid = sidDeProps(data && data.properties);
          if (sid) {
            const ids = await perimetreIds(user.nom, NOTION_TOKEN);
            dansPerim = ids.has(norm(sid));
          }
        }
      } catch (e) { dansPerim = false; }
      if (!dansPerim) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
      }
    }

    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
