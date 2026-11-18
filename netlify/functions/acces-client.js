// netlify/functions/acces-client.js
// Écran client « Qui a accès » (LECTURE SEULE) : qui, dans la marque de l'appelant, peut se connecter à HAVANA.
// BORNÉ au Code Brand déduit du JETON — ⛔ aucun paramètre de marque dans la requête, un client ne voit jamais
// une autre marque. Lisible en EMPRUNT CHEF (ro) : un chef qui emprunte doit pouvoir vérifier les accès (seul le
// lien « Changer mon code » est masqué côté client en ro). ⛔ Jamais une valeur de Code acces, jamais sa longueur :
// le serveur ne renvoie que le booléen aCode (porté par accesClient).

const { verifier } = require('./_clienttoken');
const { contactActif, accesClient } = require('./_authclient');

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

  // ── Identité : UNIQUEMENT le jeton (aucun paramètre de marque). La lecture est permise en ro. ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };

  // Garde : contact actif + marque ouverte (révocation ~60 s) ; donne le Code Brand (bornage). Panne → 503.
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };

  // callerId = l'id de l'appelant SAUF en emprunt (ro) : là, null → moi false sur chaque ligne (rien de vrai à
  // afficher, le marquage « Vous » ne peut pas apparaître même si le navigateur l'oublie). ⛔ l'id ne sort jamais.
  // gere = case « Peut gérer les accès » de l'appelant : si vrai, chaque entrée porte EN PLUS la valeur `code`
  // (décision David, codes non secrets). La lecture reste permise en ro (le chef voit ce que le client voit).
  const r = await accesClient(liv.codeBrand, vt.ro ? null : vt.id, liv.gere);
  if (!r.ok) return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  // ⛔ { nom, mail, actif, aCode, moi[, code] } par personne — jamais la longueur, jamais d'id ; `code` seulement si gère.
  // `gere` de tête : le navigateur affiche l'UI gérant (ajouter / retirer / colonne code) si et seulement si vrai.
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, acces: r.acces, gere: !!liv.gere }) };
};
