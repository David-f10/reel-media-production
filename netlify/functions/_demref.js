// netlify/functions/_demref.js
// Référence d'AFFICHAGE d'une demande : « D-<Code Brand>-<NN> » (ex. D-B33-01). Le rang NN est le rang de la
// demande parmi celles de SA MARQUE (même Code Brand), triées par id de page CROISSANT. NN sur 2 chiffres
// minimum (zéro de tête : 01…09, 10…), puis on laisse grandir (…-99, -100) : jamais de troncature.
//
// ⚠ Le rang est DÉRIVÉ À LA LECTURE, jamais stocké ni incrémenté. Rien à collisionner, et les deux côtés
//   (demande-client 'mes', demandes-admin 'liste') calculent le MÊME rang sur le MÊME ensemble sans se parler.
//   NE PAS le « simplifier » en un compteur écrit à la création : un compteur a une COURSE (deux envois
//   simultanés liraient le même numéro, Notion n'ayant ni transaction ni unicité) ; la dérivation, non.
//
// ⚠ C'est une ÉTIQUETTE D'AFFICHAGE, PAS une clé. Le rang se décale si une demande ANTÉRIEURE de la marque
//   disparaît — d'où la règle d'équipe : on ne supprime jamais une demande (on la passe en Refusée/Clôturée).
//   Le rattachement du fil (lot 2) se fait sur l'ID DE PAGE COMPLET, JAMAIS sur « D-B33-01 » (deux demandes
//   distinctes pourraient partager une étiquette, jamais un id de page).
//
// Ce fichier n'est qu'un FORMATEUR : le rang est calculé dans chaque fonction appelante (là où l'ensemble est
// lu), le format est ici, en un seul endroit. Ne pas y remettre de dérivation d'id ni de compteur.
function refDemande(codeBrand, rang) {
  const cb = String(codeBrand == null ? '' : codeBrand).trim();
  const n = parseInt(rang, 10);
  if (!cb || !(n > 0)) return ''; // marque absente ou rang inconnu → pas d'étiquette plutôt qu'une fausse
  return 'D-' + cb + '-' + (n < 10 ? '0' + n : String(n));
}

module.exports = { refDemande };
