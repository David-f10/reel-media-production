// netlify/functions/login.js
// Vérifie le code d'accès via la base Notion 👥 Équipe
// Les codes ne sont jamais exposés dans le HTML

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';

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

    // Lire les membres depuis Notion 👥 Équipe
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_EQUIPE}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_size: 100 })
    });

    if (!res.ok) throw new Error(`Notion API error: ${res.status}`);

    const data = await res.json();

    // Trouver le membre par son UUID Notion (= l'ID envoyé par le select login)
    const page = data.results.find(p => p.id === id);

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
