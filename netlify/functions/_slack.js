// netlify/functions/_slack.js
// Miroir Slack à SENS UNIQUE (M1) — un ping d'équipe quand une ligne arrive dans une file HAVANA. La ligne vit
// dans HAVANA ; Slack ne porte QUE : nom de marque + libellé + lien. JAMAIS le texte du client, jamais un
// identifiant personnel. Rien ne revient de Slack : le lien est la seule porte, vers l'app équipe (servie à '/').
//
// CONTRAT (repris de valider-client.js:9-21 — best-effort) :
//   • Appelé UNIQUEMENT après l'écriture primaire Notion. Son échec ne doit JAMAIS faire échouer le dépôt.
//   • NE LANCE JAMAIS : tout est avalé en interne. L'appelant fait un simple `await signalerSlack(...)`.
//   • SLACK_WEBHOOK_URL absente → NO-OP SILENCIEUX. Le code marche dès maintenant, avant que David pose l'env.
//   • ⛔ Le webhook n'apparaît JAMAIS : ni dans le code, ni dans un log, ni dans une réponse. On ne logge que
//     l'ÉCHEC, générique (statut ou nom d'erreur), sans l'URL ni le corps.
//   • Le helper ne sait RIEN des bases : il prend une marque + un libellé. La latence (timeout) tombe sur le
//     CLIENT qui clique « envoyer », jamais sur l'équipe — 800 ms est large pour ~100 octets.

const TIMEOUT_MS = 800;
const MAX_MARQUE = 120;

function _lienHavana() {
  const base = (process.env.SITE_ORIGIN || 'https://reel-media-production.netlify.app').replace(/\/+$/, '');
  return base + '/';
}
// Une marque est une valeur ADMIN (jamais une saisie client), mais on la borne et on neutralise sauts de ligne
// et métacaractères de lien Slack par prudence — aucun contenu client ne transite ici, de toute façon.
function _nettoyer(s) {
  return String(s == null ? '' : s).replace(/[\r\n<>]+/g, ' ').trim().slice(0, MAX_MARQUE);
}

// signalerSlack({ marque, type }) → best-effort. Ne lance jamais ; ne renvoie rien d'exploitable.
async function signalerSlack({ marque, type } = {}) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return; // no-op silencieux : rien n'est configuré (ou volontairement désactivé)
  const nom = _nettoyer(marque) || 'Un client';
  const libelle = _nettoyer(type) || 'nouvelle activité';
  // mrkdwn Slack : *gras* et <url|libellé>. Message minimal, zéro texte client.
  const texte = '*' + nom + '* · ' + libelle + ' · <' + _lienHavana() + '|voir dans HAVANA>';

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texte }),
      signal: ctrl.signal
    });
    if (!r.ok) console.error('signalerSlack : échec best-effort (statut ' + r.status + ')'); // ⛔ jamais l'URL ni le corps
  } catch (e) {
    console.error('signalerSlack : échec best-effort (' + ((e && e.name) || 'erreur') + ')'); // AbortError / réseau — jamais l'URL
  } finally {
    clearTimeout(t);
  }
}

module.exports = { signalerSlack };
