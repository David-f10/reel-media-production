// netlify/functions/login.js
// Vérifie le code d'accès via Notion 👥 Équipe
// Cache 1 minute — résilience sans compromis sécurité

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const CACHE_TTL = 60 * 1000; // 1 minute

// Cache en mémoire (partagé entre les invocations chaudes)
let membresCache = null;
let cacheTimestamp = 0;

async function getMembres(token) {
  const now = Date.now();

  // Retourner le cache si valide (< 1 minute)
  if (membresCache && (now - cacheTimestamp) < CACHE_TTL) {
    return membresCache;
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${DB_EQUIPE}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ page_size: 100 })
  });

  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);

  const data = await res.json();
  membresCache = data.results;
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
    const { id, code } = JSON.parse(event.body || '{}');
    if (!id || !code) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants' }) };
    }

    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    if (!NOTION_TOKEN) {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Token Notion manquant' }) };
    }

    // Récupérer les membres (cache ou Notion)
    const membres = await getMembres(NOTION_TOKEN);

    // Trouver le membre par UUID Notion
    const page = membres.find(p => p.id === id);

    if (!page) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Membre introuvable' }) };
    }

    const pr = page.properties;
    const codeNotion = pr['Code acces']?.rich_text?.[0]?.plain_text || '';
    const nom = pr.Nom?.title?.[0]?.plain_text || '';
    const role = pr.Role?.select?.name || 'Journaliste';

    if (!codeNotion || codeNotion !== code) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Code incorrect' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        user: { id: page.id, nom, role }
      })
    };

  } catch (e) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible — réessayez' })
    };
  }
};
