// netlify/functions/login.js
// Vérifie le code d'accès via Notion 👥 Équipe
// Cache 1 minute — résilience sans compromis sécurité

const { verifierThrottle, enregistrerEchec, enregistrerSucces, POLICE_EQUIPE } = require('./_throttle');

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const CACHE_TTL = 60 * 1000; // 1 minute

function clientIp(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || '').trim() || String(h['x-forwarded-for'] || '').split(',')[0].trim() || '';
}

// Cache en mémoire (partagé entre les invocations chaudes)
let membresCache = null;
let cacheTimestamp = 0;
let lastForcedRefresh = 0;          // borne anti-amplification du refresh-on-miss (code tout juste changé / membre neuf)
const FORCE_FLOOR = 10 * 1000;      // au plus 1 relecture forcée par 10 s

async function getMembres(token, force = false) {
  const now = Date.now();

  // Retourner le cache si valide (< 1 minute), sauf relecture forcée
  if (!force && membresCache && (now - cacheTimestamp) < CACHE_TTL) {
    return membresCache;
  }

  // Pagination RÉELLE : sans elle, au-delà de 100 membres les suivants ne pourraient ni se connecter ni
  // apparaître dans le sélecteur, SILENCIEUSEMENT. Garde-fou 20 pages. 30 membres aujourd'hui, mais c'était
  // une bombe à retardement (même classe que celle désamorcée côté client en PR 2bis).
  const all = [];
  let cursor = null, pages = 0;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_EQUIPE}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
    const data = await res.json();
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
    pages++;
  } while (cursor && pages < 20);
  membresCache = all;
  cacheTimestamp = now;
  return membresCache;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    if (!NOTION_TOKEN) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Token Notion manquant' }) };
    }

    // ── action:'list' — liste des noms pour le SÉLECTEUR de login ──────────────
    // On ne peut pas s'identifier avant de savoir qui on est : le select de login doit s'afficher
    // SANS identité. Depuis le verrou du proxy (2/3), DB_EQUIPE n'est plus lisible par le proxy sans
    // identité ; login.js (fetch server-side) sert donc la liste. Renvoie {id, nom, role, nomComplet,
    // flags} — JAMAIS de code d'accès (ces noms/rôles sont déjà ceux qu'affiche le select de login).
    if (payload.action === 'list') {
      const membres = await getMembres(NOTION_TOKEN);
      const equipe = membres.map(p => {
        const pr = p.properties || {};
        return {
          id: p.id,
          nom: pr.Nom?.title?.[0]?.plain_text || '',
          nomComplet: pr['Nom complet']?.rich_text?.[0]?.plain_text || '',
          role: pr.Role?.select?.name || '',
          contactBrandDefaut: pr['Contact Brand défaut']?.checkbox || false,
          chefDefaut: pr['Chef défaut']?.checkbox || false
          // acces / peutGererAcces NE descendent PLUS ici : non authentifié, ils révéleraient QUI porte
          // la clé « gère les accès ». L'écran de gestion les relit par le proxy, une fois connecté.
        };
      }).filter(m => m.nom);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, equipe }) };
    }

    const { id, code } = payload;
    if (!id || !code) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants' }) };
    }

    // Throttle porte ÉQUIPE (NAT bureau) : ralentissement progressif compte(id)+IP, JAMAIS de verrou dur.
    // AVANT toute vérification → protège aussi Notion de la charge de brute-force.
    const ip = clientIp(event);
    const t = await verifierThrottle(ip, id, POLICE_EQUIPE);
    if (t.bloque) {
      return { statusCode: 429, headers: { ...headers, 'Retry-After': String(t.retryAfter || 1) }, body: JSON.stringify({ ok: false, error: 'Trop de tentatives, réessayez dans un instant' }) };
    }

    // Récupérer les membres (cache ou Notion), puis vérifier.
    let membres = await getMembres(NOTION_TOKEN);
    let page = membres.find(p => p.id === id);
    let codeNotion = page ? (page.properties['Code acces']?.rich_text?.[0]?.plain_text || '') : '';
    // Refresh-on-miss BORNÉ : (id,code) qui ne matche pas la liste en cache → UNE relecture (gère un
    // membre neuf ou un code tout juste changé sans attendre les 60 s). Un miss n'arrive qu'avec un code
    // faux/neuf — jamais en régime normal ; FORCE_FLOOR borne à 1 relecture/10 s (anti-amplification).
    if ((!page || codeNotion !== code) && (Date.now() - lastForcedRefresh > FORCE_FLOOR)) {
      lastForcedRefresh = Date.now();
      membres = await getMembres(NOTION_TOKEN, true);
      page = membres.find(p => p.id === id);
      codeNotion = page ? (page.properties['Code acces']?.rich_text?.[0]?.plain_text || '') : '';
    }

    if (!page) {
      await enregistrerEchec(ip, id, POLICE_EQUIPE);
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Membre introuvable' }) };
    }
    const pr = page.properties;
    const nom = pr.Nom?.title?.[0]?.plain_text || '';
    const role = pr.Role?.select?.name || 'Journaliste';
    const acces = pr['Accès']?.select?.name || 'Complet';           // défaut sûr (cf. action:'list')
    const peutGererAcces = pr['Peut gérer les accès']?.checkbox === true;

    if (!codeNotion || codeNotion !== code) {
      await enregistrerEchec(ip, id, POLICE_EQUIPE);
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Code incorrect' }) };
    }

    await enregistrerSucces(ip, id, POLICE_EQUIPE);
    // Booléen GLOBAL « le cloisonnement est configuré » (une clé OU un accès non-Complet existe quelque
    // part), SANS révéler QUI. Sert au portail de l'écran « Gérer l'équipe » — affordance d'interface,
    // pas une frontière de sécurité (celle-ci est serveur : PROPS_ACCES / access-set, clé vérifiée).
    const accesConfigure = (membres || []).some(p => {
      const q = (p && p.properties) || {};
      return (q['Peut gérer les accès']?.checkbox === true) || (q['Accès']?.select?.name && q['Accès'].select.name !== 'Complet');
    });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        user: { id: page.id, nom, role, acces, peutGererAcces },
        accesConfigure
      })
    };

  } catch (e) {
    // Ne plus avaler l'erreur (ex. 401 Notion) en silence — c'est le trou de diagnostic du 24, côté équipe.
    console.error('login indispo : ' + (e && e.message || ''));
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible — réessayez' })
    };
  }
};
