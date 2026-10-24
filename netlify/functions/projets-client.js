// netlify/functions/projets-client.js
// Lot G tranche 1 — liste des projets de la marque du client (écran 05, brut). SÉCURITÉ :
//  • identité RE-VÉRIFIÉE à CHAQUE appel (verifyClient), jamais de confiance au navigateur ;
//  • le périmètre est DÉRIVÉ CÔTÉ SERVEUR du Code Brand du contact authentifié — le client n'envoie
//    AUCUN code marque ni id de projet, donc rien à trafiquer pour viser une autre marque ;
//  • réserve 2 : un ÉCHEC (auth indispo, ou calcul de périmètre en échec) ne rend JAMAIS une liste vide —
//    il rend 401/503 pour que l'écran dise « temporairement indisponible », jamais « aucun projet ».
// N'utilise PAS le proxy équipe (notion.js) : fonction dédiée, isolation maximale.

const { verifyClient } = require('./_authclient');
const { projetsDeMarque } = require('./_perimetreclient');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-mail, x-rmc-code',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const h = event.headers || {};
  const mail = h['x-rmc-mail'] || h['X-Rmc-Mail'] || '';
  const code = h['x-rmc-code'] || h['X-Rmc-Code'] || '';

  const v = await verifyClient({ mail, code });
  if (!v.ok) {
    if (v.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  }

  // Code Brand pris SUR LE CONTACT authentifié, jamais sur la requête.
  const res = await projetsDeMarque(v.contact.codeBrand, process.env.NOTION_TOKEN);
  if (!res.ok) {
    // Échec de calcul → surtout PAS { projets: [] }. Statut distinguable d'un vrai vide (réserve 2).
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, projets: res.projets }) };
};
