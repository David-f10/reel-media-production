exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'NOTION_TOKEN manquant' })
    };
  }

  const path = event.queryStringParameters?.path || '';
  const url = `https://api.notion.com/v1${path}`;

  try {
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

    // ── Projection de sécurité ────────────────────────────────────────────────
    // Le proxy relaie la réponse Notion BRUTE. Sans ce filtre, une requête sur la base
    // 👥 Équipe fait descendre le 'Code acces' de chaque membre dans le corps HTTP
    // (visible dans l'onglet Réseau). On RETIRE donc cette propriété de toute page renvoyée.
    //   • SUPPRESSION de la clé (delete), pas un vidage de valeur.
    //   • GÉNÉRIQUE sur le NOM de propriété — jamais conditionné à l'id de DB_EQUIPE :
    //     si la base change d'id, la protection tient.
    //   • Deux formes de réponse couvertes : liste (/databases/{id}/query → data.results[])
    //     et page unique (GET/PATCH/POST /pages/{id} → data.properties).
    //   • Codage défensif par vérification de type — SANS try/catch : une projection qui
    //     échouerait en silence laisserait passer la réponse brute, donc rouvrirait la faille.
    const PROP_SECRETE = 'Code acces';
    const retirerPropSecrete = (page) => {
      if (page && typeof page === 'object' && page.properties && typeof page.properties === 'object') {
        delete page.properties[PROP_SECRETE];
      }
    };
    if (data && typeof data === 'object') {
      if (Array.isArray(data.results)) data.results.forEach(retirerPropSecrete); // réponse LISTE
      if (data.properties) retirerPropSecrete(data);                              // réponse PAGE unique
    }

    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
