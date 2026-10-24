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

// Réessai 429 du relais + budget de temps GLOBAL de l'invocation. Le défaut Netlify est 10 s par appel
// synchrone (aucun override dans netlify.toml) : on borne l'HORLOGE MURALE depuis l'entrée du handler,
// bien en-dessous, pour qu'une rafale ne tue jamais la fonction par timeout (pire qu'un 429 rendu vite).
const RELAY_MAX_TENT = 3;    // 1 essai + 3 réessais au plus, sur 429 UNIQUEMENT
const WAIT_CAP_MS    = 4000; // plafond d'UNE attente (Retry-After inclus)
const BUDGET_MS      = 6000; // budget global (ms) ; une query Notion peut prendre 1–2 s → marge laissée

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
// Lot A : la page `pageId` est-elle un brouillon CLIENT EN LIGNE du sujet `sujetId` ? Sert à autoriser
// l'envoi (bascule Brouillon→false + Série) et la SUPPRESSION d'un brouillon par le client via la voie
// review. Le discriminant est le marqueur FIGÉ 'Déposé en ligne' (posé par review.html au dépôt), jamais
// l'auteur : une transcription de l'équipe (Source='Client', Brouillon, sans ce marqueur) n'est donc
// JAMAIS gérable par le client. FAIL-CLOSED : toute erreur → false → l'appelant refuse.
async function pageBrouillonClientEnLigne(pageId, sujetId, token) {
  try {
    const r = await fetch('https://api.notion.com/v1/pages/' + pageId, {
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
    });
    if (!r.ok) return false;
    const p = await r.json();
    const pr = p && p.properties; if (!pr) return false;
    const src = pr.Source && pr.Source.select && pr.Source.select.name;
    const enLigne = !!(pr['Déposé en ligne'] && pr['Déposé en ligne'].checkbox);
    const brouillon = !!(pr.Brouillon && pr.Brouillon.checkbox);
    const sid = sidDeProps(pr);
    return src === 'Client' && enLigne && brouillon && !!sid && norm(sid) === norm(sujetId);
  } catch (e) { return false; }
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

  // Échéance GLOBALE de l'invocation (horloge murale) : partagée par perimetreIds ET le relais, pour que
  // la SOMME des attentes + des allers-retours Notion ne dépasse jamais le budget. Posée ici, au plus tôt.
  const DEADLINE = Date.now() + BUDGET_MS;

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
      // Lot A : on relâche le filtre pour laisser descendre AUSSI les brouillons déposés EN LIGNE par le
      // client (il doit les relire/modifier/envoyer). Les transcriptions de l'équipe (Source='Client',
      // Brouillon, SANS marqueur 'Déposé en ligne') ne descendent toujours jamais. Marqueur figé, donc
      // aucune dérive si la composition de l'équipe change ; aucune lecture DB_EQUIPE sur ce chemin.
      filtreSortie = (page) => {
        const p = page && page.properties;
        if (!p) return false;
        const src = p.Source && p.Source.select && p.Source.select.name;
        if (src !== 'Client') return false;                                 // jamais de contenu interne équipe
        if (!(p.Brouillon && p.Brouillon.checkbox)) return true;            // retour client ENVOYÉ → descend
        return !!(p['Déposé en ligne'] && p['Déposé en ligne'].checkbox);   // brouillon : seulement si déposé EN LIGNE
      };
    } else if (route.kind === 'create') {
      // Dépôt d'un retour : page dans DB_RETOURS, propriété 'Sujet ID' = sujetId DU JETON.
      const sid = body && body.properties && body.properties['Sujet ID'] && body.properties['Sujet ID'].rich_text
        && body.properties['Sujet ID'].rich_text[0] && body.properties['Sujet ID'].rich_text[0].text
        && body.properties['Sujet ID'].rich_text[0].text.content;
      autorise = !!(body && body.parent && norm(body.parent.database_id) === norm(DB_RETOURS) && sid && norm(sid) === norm(rev.sujetId));
    } else if (route.kind === 'page' && method === 'PATCH') {
      const props = body && body.properties;
      const keys = props && typeof props === 'object' ? Object.keys(props) : [];
      if (norm(route.pageId) === norm(rev.sujetId) && keys.length === 1 && keys[0] === 'Statut') {
        // Cas existant : PATCH du SEUL 'Statut' sur LE sujet du jeton.
        autorise = true;
      } else if (await pageBrouillonClientEnLigne(route.pageId, rev.sujetId, NOTION_TOKEN)) {
        // Lot A : par le proxy, le client ne peut QUE SUPPRIMER son brouillon en ligne ({ archived:true }
        // SEUL — un retour mal déposé ne reste jamais coincé). L'ENVOI (bascule Brouillon + numéro de
        // série) passe par la fonction dédiée envoyer-retours.js, qui dérive la série CÔTÉ SERVEUR : le
        // navigateur n'écrit JAMAIS 'Brouillon' ni 'Série' par cette voie.
        autorise = body && body.archived === true && keys.length === 0;
      }
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
      const CASCADE = [DB_RETOURS, DB_VERSIONS, DB_COMMENTS, DB_MUSIQUES, DB_REFS].map(norm);

      if (route.kind === 'query') {
        if (dbId === norm(DB_PROD)) {
          // Production : relai, puis filtre de sortie aux sujets du périmètre (incontournable, patron 1/3).
          filtreSortie = (page) => pageDansPerimetre(page, nom);
        } else if (CASCADE.includes(dbId)) {
          // Cascade. Deux formes :
          //  • query scopée à UN sujet (Sujet ID extractible) → ce sujet doit être au périmètre
          //    (garde d'entrée, bon marché : 403 sinon) ;
          //  • query TRANSVERSE (or / {} / and imbriqué — pas de Sujet ID extractible ; p.ex.
          //    chargerRetoursActionnables sur {or:Statut}, chargerHistorique sur {}) → JAMAIS 403 :
          //    on relaie puis on BORNE la réponse aux sujets du périmètre (filtre de sortie
          //    incontournable, patron DB_PROD). Toute requête transverse, même non auditée, est
          //    ainsi scopée — jamais cassée, jamais fuyante.
          let ids;
          try { ids = await perimetreIds(nom, NOTION_TOKEN, DEADLINE); }
          catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'Périmètre indisponible' }) }; }
          const sid = filtreSujetId(body && body.filter);
          if (sid) {
            if (!ids.has(norm(sid))) {
              return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
            }
          } else {
            filtreSortie = (page) => ids.has(norm(sidDeProps(page && page.properties)));
          }
        } else if (dbId === norm(DB_CORRECTIONS)) {
          // Historique : NON cloisonné, relayé tel quel (aucun filtre de sortie). Deux raisons :
          //  (1) la base Corrections n'a pas de 'Sujet ID' — rien à borner par périmètre ;
          //  (2) sa base, /data/archives-historique.json, est DÉJÀ servie EN STATIQUE — le navigateur
          //      de l'externe l'a en entier — donc cloisonner l'enrichissement Notion par-dessus serait
          //      du théâtre, et viderait l'écran Historique sans le dire.
          // ⚠️ CONDITION : si /data/archives-historique.json est un jour FERMÉ (p.ex. lot G, vrais
          //    comptes clients), cette exception DOIT être revue — l'historique redeviendrait sensible.
          // Lecture seule : l'écriture d'une correction par un externe reste refusée plus bas
          // (create/PATCH), faute de 'Sujet ID' au périmètre.
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
        try { ids = await perimetreIds(nom, NOTION_TOKEN, DEADLINE); }
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
        try { ids = await perimetreIds(nom, NOTION_TOKEN, DEADLINE); }
        catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ error: 'Périmètre indisponible' }) }; }
        if (!sid || !ids.has(norm(sid))) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Hors périmètre' }) };
        }
      }
    }
  }

  // ── 4. Relais Notion (réessai 429 borné par DEADLINE) + projection (1/3) ──
  const url = `https://api.notion.com/v1${path}`;
  try {
    let response, tent = 0;
    for (;;) {
      response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: (method === 'POST' || method === 'PATCH') ? event.body : undefined
      });
      // 429 SEUL est réessayé (un 429 Notion est renvoyé AVANT exécution → réessayer une écriture est
      // sans risque de double-écriture, et c'est cohérent avec api() client). Toute autre erreur sort.
      if (response.status !== 429 || tent >= RELAY_MAX_TENT) break;
      const ra = parseFloat(response.headers && response.headers.get && response.headers.get('retry-after'));
      const attente = Math.min(WAIT_CAP_MS, ra > 0 ? ra * 1000 : 400 * Math.pow(2, tent));
      if (Date.now() + attente > DEADLINE) break; // budget GLOBAL (horloge murale) épuisé → on rend vite
      await new Promise(res => setTimeout(res, attente));
      tent++;
    }

    // Erreur Notion (429 persistant inclus) : NE PAS relayer le corps brut — ses messages peuvent nommer
    // la base interrogée. On renvoie le STATUT réel + un corps NEUTRE, et on garde le détail en logs
    // serveur. Conséquence voulue : un 429 ressort DONC en 429 (réessayable par api() client), jamais
    // masqué en 403 par verifPageExterne (qui, sur un corps d'erreur sans parent/properties, refuserait).
    // Fail-closed : jamais un 200 fabriqué.
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch (_) {}
      console.error('relais Notion ' + response.status + ' [' + route.kind + ' ' + (route.dbId || route.pageId || '') + ']' + (detail ? ' ' + detail : ''));
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'Notion ' + response.status }) };
    }

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
            const ids = await perimetreIds(user.nom, NOTION_TOKEN, DEADLINE);
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
