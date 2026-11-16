// netlify/functions/_demref.js
// Référence d'AFFICHAGE d'une demande : « D- » + les 8 DERNIERS hex de l'id de page Notion, en majuscules.
//
// ⚠ Les id de page Notion sont ORDONNÉS DANS LE TEMPS : l'entropie est dans les DERNIERS caractères, pas les
//   premiers (mesuré : sur 100 pages réelles de la base Production, les 14 premiers hex sont quasi constants ;
//   slice(0,6) donnait ~4 valeurs distinctes sur 100). On prend donc les DERNIERS, jamais les premiers.
//   slice(-8) : 8 hex = 4,3 milliards, négligeable même à plusieurs milliers de demandes par an.
//
// ⚠ C'est une ÉTIQUETTE D'AFFICHAGE, PAS une clé. Une dérivation, même bonne, peut collisionner. Le rattachement
//   du fil (lot 2) se fait sur l'ID DE PAGE COMPLET (champ « Réf demande » de 💬 Messages), unique par
//   construction — JAMAIS sur « D-xxxxxxxx » (sinon deux fils de demandes distinctes fusionneraient).
//
// Helper PARTAGÉ : demande-client ('mes') et demandes-admin ('liste') composent la MÊME référence depuis le même
// id. On compose côté SERVEUR ; l'id de page brut ne descend jamais au navigateur.
function refDemande(id) {
  var hex = String(id == null ? '' : id).replace(/-/g, '').toLowerCase();
  if (!hex) return '';
  return 'D-' + hex.slice(-8).toUpperCase();
}

module.exports = { refDemande };
