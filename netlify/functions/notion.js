exports.handler = async function(event) {
  const path = event.queryStringParameters?.path || '';
  const token = event.headers['x-notion-token'];

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token manquant' }) };
  }

  const url = `https://api.notion.com/v1${path}`;

  const response = await fetch(url, {
    method: event.httpMethod === 'GET' ? 'GET' : event.httpMethod,
    headers: {
      'Authorization': `Bearer ${token}`,
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
      'Access-Control-Allow-Headers': 'Content-Type, x-notion-token',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
    },
    body: JSON.stringify(data)
  };
};
