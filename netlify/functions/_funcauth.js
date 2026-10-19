// netlify/functions/_funcauth.js
// Autorisation des fonctions HORS proxy (notify, drive-view-session, drive-download-review).
// Elles ne passent pas par notion.js, donc ni le verrou de la 2/3a ni les jetons de la 2/3b-1 ne les
// couvraient. Deux appelants admis, RIEN d'autre (fail-closed) :
//   • MEMBRE identifié — en-têtes x-rm-id + x-rm-code → verifyUser (accès complet, pas de scope).
//   • JETON de review — en-tête x-review-token OU body.reviewToken, borné à SON sujet : le code/id du
//     jeton doit correspondre au sujet visé par l'appel (`scope`).
// ⚠️ Le jeton est lu en en-tête OU dans le corps : sendBeacon (close de drive-view-session) ne peut
//    poser aucun en-tête personnalisé, le jeton voyage donc dans le corps pour cet appel.

const { verifyUser } = require('./_auth');
const { verifyReview } = require('./_review');

const norm = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase();

// Renvoie { ok:true, kind:'member'|'review', user?, review? } ou { ok:false }.
// `scope` = { sujetCode?, sujetId? } : contraintes vérifiées UNIQUEMENT pour un jeton de review.
async function authFonction(event, body, scope = {}) {
  const h = event.headers || {};
  const rid   = h['x-rm-id']   || h['X-Rm-Id']   || '';
  const rcode = h['x-rm-code'] || h['X-Rm-Code'] || '';

  // Voie MEMBRE : si les deux en-têtes d'identité sont présents, on tranche là (valide → ok ; invalide
  // → refus, sans repli silencieux sur un jeton — un membre légitime n'a pas de jeton de review).
  if (rid && rcode) {
    const auth = await verifyUser({ id: rid, code: rcode });
    return auth.ok ? { ok: true, kind: 'member', user: auth.user } : { ok: false };
  }

  // Voie JETON DE REVIEW : en-tête OU corps (sendBeacon).
  const tok = h['x-review-token'] || h['X-Review-Token'] || (body && body.reviewToken) || '';
  const rev = verifyReview(tok);
  if (!rev.ok) return { ok: false };
  if (scope.sujetCode != null && scope.sujetCode !== '' && norm(scope.sujetCode) !== norm(rev.code)) return { ok: false };
  if (scope.sujetId   != null && scope.sujetId   !== '' && norm(scope.sujetId)   !== norm(rev.sujetId)) return { ok: false };
  return { ok: true, kind: 'review', review: rev };
}

module.exports = { authFonction };
