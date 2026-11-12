// netlify/functions/_notionio.js
// Lot 1 (emprunt chef) — POINT DE PASSAGE UNIQUE de TOUT appel HTTP à l'API Notion fait par la lane
// client montage. La « lecture seule » d'une session empruntée ne peut PAS vivre dans client.html (cacher
// des boutons) ni dans un drapeau posé à chaque site d'appel (« ecriture: action!=='lire' » : fragile,
// dépend de se souvenir — et oublie les lectures non-'lire' que sont la vidéo 'open'/'heartbeat' et
// drive-stream-open). Le refus vit ICI, à l'octet où la requête part :
//
//   appelNotion(ro, chemin, methode, token, body) → Response (brute : l'appelant lit status + corps).
//     • ro === false → comportement identique à un fetch nu (aucun changement pour un vrai client).
//     • ro === true  → toute MUTATION est refusée AVANT le réseau (RefusLectureSeule), aucune donnée
//       ne part. Une LECTURE (GET, ou POST d'une query de data source) passe normalement.
//
// La discrimination est sur la MÉTHODE + le CHEMIN, JAMAIS sur le nom d'action : une query Notion est un
// POST sur .../query (lecture), tout le reste en POST/PATCH/PUT/DELETE est une écriture. Donc une écriture
// FUTURE, quel que soit son nom d'action ou le fichier où elle atterrit, est refusée par défaut dès qu'elle
// passe par ici — y compris la création « directe » de retour qui n'utilise pas le wrapper notionFetch.
// C'est la seule garde qui ne dépende pas de la mémoire du développeur : la seule façon d'écrire sans elle
// est de rappeler `fetch('api.notion.com', …)` à la main — un écart voyant, repérable d'un grep.
//
// Les six écritures client réelles (ajout de retour, suppression de brouillon, validation montage, envoi
// des retours, validation séquencier, demande de corrections) sont un POST /pages ou un PATCH /pages/<id>,
// toutes refusées ici sous ro. Les lectures (lire, open, heartbeat, espace, flux vidéo) passent.

const BASE = 'https://api.notion.com/v1';

// Lecture Notion = GET, OU POST sur un chemin .../query (query d'une data source). Tout le reste mute.
function estLecture(methode, chemin) {
  const m = String(methode || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m === 'POST' && /\/query(?:\?|$)/.test(String(chemin || ''))) return true; // POST .../query = lecture
  return false;
}

// Erreur DISTINGUABLE : l'appelant la reconnaît (e.lectureSeule === true) pour rendre un 403 franc plutôt
// qu'un 503. Même si un appelant l'oublie, la SÉCURITÉ tient : l'écriture n'a pas eu lieu (jetée avant le
// réseau) ; seul le code de statut rendu serait moins précis.
class RefusLectureSeule extends Error {
  constructor() { super('lecture-seule'); this.name = 'RefusLectureSeule'; this.lectureSeule = true; }
}

async function appelNotion(ro, chemin, methode, token, bodyObj) {
  if (ro && !estLecture(methode, chemin)) throw new RefusLectureSeule(); // refus AVANT le réseau
  const opt = {
    method: methode,
    headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28' }
  };
  if (bodyObj !== undefined && bodyObj !== null) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(bodyObj);
  }
  return fetch(BASE + chemin, opt);
}

module.exports = { appelNotion, estLecture, RefusLectureSeule };
