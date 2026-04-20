exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
      },
      body: ''
    };
  }

  // Vérifier que l'utilisateur est authentifié via Netlify Identity
  const authHeader = event.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Non autorisé' })
    };
  }

  // Token Notion stocké dans les variables d'environnement Netlify
  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Token Notion non configuré' })
    };
  }

  const path = event.queryStringParameters?.path || '';
  const url = `https://api.notion.com/v1${path}`;

  const response = await fetch(url, {
    method: event.httpMethod,
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: ['POST', 'PATCH', 'PUT'].includes(event.httpMethod) ? event.body : undefined
  });

  const data = await response.json();

  return {
    statusCode: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
    },
    body: JSON.stringify(data)
  };
};
