// client-etat.js — aiguilleur des états de l'espace client (chargé par client.html, et testable sous Node).
// C'est ICI que vit la réserve 2 côté interface : l'état se décide sur le STATUT HTTP + `ok` du serveur,
// JAMAIS sur projets.length. Un échec (réseau, 5xx, ok:false, réponse malformée) ne devient jamais « VIDE ».
//
//   LISTE   : connecté, des projets à montrer.
//   VIDE    : connecté, aucun projet exposé — UNIQUEMENT si le serveur dit explicitement ok:true + tableau.
//   EXPIRE  : 401 — identité refusée (session invalide) → retour connexion.
//   INDISPO : tout le reste (503, 429, ok:false, corps absent/malformé) → alerte + « Réessayer ».
function etatDepuisReponse(status, body) {
  if (status === 401) return 'EXPIRE';
  if (status === 200 && body && body.ok === true && Array.isArray(body.projets)) {
    return body.projets.length > 0 ? 'LISTE' : 'VIDE';
  }
  return 'INDISPO';
}
if (typeof module !== 'undefined' && module.exports) module.exports = { etatDepuisReponse };
