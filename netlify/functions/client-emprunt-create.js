// netlify/functions/client-emprunt-create.js
// Lot 1 (entrée) — MINT de l'emprunt chef « Voir incognito ». Depuis une carte HAVANA, un gestionnaire
// d'accès ouvre l'espace du client EN LECTURE SEULE (la serrure est _notionio, déjà en prod). Ici on ne
// fait qu'ÉMETTRE une session ro et une remise à usage unique ; AUCUNE écriture client ne part d'ici.
//
// Gardes :
//   - Appelant = membre vérifié (verifyUser, x-rm-id / x-rm-code, comme access-set.js / code-reset.js) ET
//     porteur de la clé « Peut gérer les accès ». Sinon 403. (verifyUser est IMPORTÉ, _auth.js non modifié.)
//   - On emprunte l'identité du CONTACT qui a commenté (contactId fourni), pour que ses retours s'affichent
//     comme les siens. Ce contact doit être ACTIF et sa marque OUVERTE — même porte que le client lui-même
//     (contactActif : révocation ~60 s, garde d'activation marque). Révoqué entre-temps → l'emprunt échoue.
//   - Session signée ro + acteur (id du chef) via _clienttoken, TTL COURT 15 min (pas 14 j).
//   - Remise à usage unique 120 s en Blobs (jamais le jeton dans l'URL) ; audit durable écrit AVANT d'émettre.
//
// Aucune valeur de secret, de code ou de jeton n'est journalisée.

const crypto = require('crypto');
const { verifyUser } = require('./_auth');          // IMPORT seul (comme access-set / code-reset)
const { contactActif, premierContactActif } = require('./_authclient');
const { CODE_BRAND_RE } = require('./_perimetreclient'); // SEULE autorité sur la forme d'un code marque
const { signer } = require('./_clienttoken');
const { getEmpruntTokenStore, getEmpruntAuditStore } = require('./_blobs');

const HANDOFF_TTL_MS = 120 * 1000;        // remise HAVANA → espace
const SESSION_TTL_MS = 15 * 60 * 1000;    // emprunt (lecture seule)
const EST_ID = (s) => /^[0-9a-f]{32}$/.test(String(s || '').replace(/-/g, '').toLowerCase());

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // 1) Appelant : membre identifié ET porteur de la clé « Peut gérer les accès ».
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || !auth.user || auth.user.peutGererAcces !== true) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires d\'accès' }) };
  }

  // 2) Qui emprunter — DEUX portes :
  //    (a) depuis un COMMENTAIRE : contactId fourni (le commentateur) ;
  //    (b) depuis une CARTE : sujetCode fourni → on isole la marque et on prend un contact ACTIF déterministe
  //        (premier par nom), sans attendre qu'un client écrive.
  let contactId = String(body.contactId || '').trim();
  if (!contactId) {
    const sujetCode = String(body.sujetCode || '').trim();
    // Découpe : on retire les lettres de déclinaison en fin de code ; la FORME du code marque est validée
    // par la SEULE autorité partagée, CODE_BRAND_RE importée (pas de 2e regex de code marque ici).
    const codeBrand = sujetCode.replace(/[A-Za-z]+$/, '').trim();
    if (!CODE_BRAND_RE.test(codeBrand)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Carte sans code marque exploitable' }) };
    const pc = await premierContactActif(codeBrand);
    if (!pc.ok) {
      if (pc.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
      return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Aucun interlocuteur actif pour cette marque.' }) };
    }
    contactId = pc.contact.id;
  }
  if (!EST_ID(contactId)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'contactId manquant ou invalide' }) };

  // 3) Le contact doit être ACTIF et sa marque OUVERTE — la MÊME porte que le client (pour les deux portes).
  //    Échec = réglage (espace fermé) ou révocation ; dominante vérifiée en base : 63 marques sur 65 fermées.
  const liv = await contactActif(contactId);
  if (!liv.ok) {
    if (liv.raison === 'indispo') return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'L\'espace client de cette marque n\'est pas encore ouvert.' }) };
  }

  // 4) Session ro, TTL court, acteur = chef (pour l'audit et l'estampille serveur).
  const jeton = signer(contactId, { ro: true, acteur: auth.user.id, ttlMs: SESSION_TTL_MS });
  if (!jeton.ok) {
    console.error('client-emprunt-create indispo : CLIENT_SIGN_SECRET=' + !!process.env.CLIENT_SIGN_SECRET);
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
  const now = Date.now();
  const exp = now + SESSION_TTL_MS;

  // 5) Audit DURABLE d'abord (la trace doit exister avant qu'on ouvre la porte). Échec → 503, pas d'emprunt
  //    non tracé.
  try {
    const audit = getEmpruntAuditStore();
    await audit.setJSON(now + '-' + crypto.randomBytes(6).toString('hex'), {
      chefId: auth.user.id, chefNom: auth.user.nom || '', contactId,
      codeBrand: liv.codeBrand || '', marque: liv.marque || '', ts: now
    });
  } catch (e) {
    console.error('client-emprunt-create audit KO : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }

  // 6) Remise à usage unique (Blobs 120 s). Le jeton ro n'apparaît jamais dans l'URL.
  try {
    const store = getEmpruntTokenStore();
    const remise = crypto.randomBytes(32).toString('base64url');
    await store.setJSON(remise, { jeton: jeton.token, exp, marque: liv.marque || '', nom: liv.nom || '', createdAt: now, expiresAt: now + HANDOFF_TTL_MS });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token: remise, ttlMs: HANDOFF_TTL_MS }) };
  } catch (e) {
    console.error('client-emprunt-create remise KO : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
