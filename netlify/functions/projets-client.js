// netlify/functions/projets-client.js
// Lot G — liste des projets de la marque du client (écran 05). SÉCURITÉ :
//  • le client présente un JETON de session signé (F1), plus jamais le code. Vérif signature + expiration.
//  • identité RE-DÉRIVÉE du jeton puis contact RELU EN LIVE (contactActif) : Actif (révocation ~60 s) +
//    Code Brand courant. Le périmètre vient du serveur, le client n'envoie aucun code marque ni id.
//  • réserve 2 : un ÉCHEC (jeton invalide/expiré, contact désactivé, périmètre en échec) rend 401/503,
//    JAMAIS une liste vide.
//  • PAS de throttle ici : avec un jeton signé, cet endpoint n'est plus un oracle de brute-force (on ne
//    devine pas une signature). La limitation d'identifiants reste sur login-client, seul point de saisie.
// N'utilise PAS le proxy équipe (notion.js). CORS restreint (F4).

const { contactActif } = require('./_authclient');
const { projetsDeMarque } = require('./_perimetreclient');
const { verifier } = require('./_clienttoken');

// CORS (F4) : hôte exact + SITE_ORIGIN seulement ; plus de regex large *.netlify.app. Voir login-client.js.
function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const h = event.headers || {};
  const token = h['x-rmc-token'] || h['X-Rmc-Token'] || '';

  // 1) Jeton de session : signature + expiration.
  const vt = verifier(token);
  if (!vt.ok) {
    if (vt.raison === 'config') { // CLIENT_SIGN_SECRET absent → fail-closed + log booléen (F1)
      console.error('projets-client indispo : CLIENT_SIGN_SECRET=' + !!process.env.CLIENT_SIGN_SECRET);
      return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    }
    // invalide / expiré → session finie → l'écran renvoie à la connexion.
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  }

  // 2) Relecture LIVE du contact (Actif + Code Brand), clé = id du jeton.
  const liv = await contactActif(vt.id);
  if (!liv.ok) {
    if (liv.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) }; // désactivé/disparu → re-login
  }

  // 3) Périmètre, dérivé côté serveur du Code Brand courant.
  const res = await projetsDeMarque(liv.codeBrand, process.env.NOTION_TOKEN);
  if (!res.ok) {
    // Échec de calcul → surtout PAS { projets: [] }. Statut distinguable d'un vrai vide (réserve 2).
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, projets: res.projets }) };
};
