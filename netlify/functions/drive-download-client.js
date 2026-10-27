// netlify/functions/drive-download-client.js
// Lot G tranche 2 — téléchargement depuis l'ESPACE CLIENT. Déclinaison EXACTE de drive-download-review.js :
// seuls l'IDENTITÉ et le PÉRIMÈTRE changent, le reste est repris à l'identique.
//   • identité + périmètre : le portier client _montageclient.autoriserMontage (jeton de session x-rmc-token
//     + contact actif + sujet ∈ projetsDeMarque de sa marque) — PAS le portier review borné à un sujet.
//   • le serveur RE-DÉRIVE lui-même les fileId autorisés (fileIdsDuSujet = UNION source A ∪ source B, la
//     MÊME que review) et refuse tout fileId hors de cette liste ; il ne fait JAMAIS confiance au fileId
//     envoyé par la page. Le downloadUrl n'est JAMAIS loggé. Révocation immédiate via _drive (piste B).
//
// DIFFÉRENCE ASSUMÉE vs le VISIONNAGE (drive-view-client, condition 4 = version courante seule) : le
// téléchargement n'est PAS borné à la courante. Le client peut retélécharger TOUTE version qu'on lui a
// montrée → on garde l'union A∪B complète (comme drive-download-review, « versions Annulées incluses »),
// sans appliquer la condition 4.
//
// Pas de QUOTA ici (lot C, plus tard) : aucune raison de sécurité de bloquer la livraison sans — chaque
// téléchargement est éphémère + révoqué immédiatement + borné à l'A∪B de la marque du client. Le quota est
// un garde-fou de coût/abus, pas une frontière. (Et aucun appelant front encore : le « Télécharger » des
// Livrés n'est pas câblé — endpoint dormant et entièrement gardé jusque-là.)

const { openEphemeralDownload, extractFileId } = require('./_drive');
const { fileIdsDuSujet } = require('./drive-download-review'); // MÊME re-dérivation A∪B que la lane review
const { autoriserMontage } = require('./_montageclient');

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const sujetCode = String(body.sujetCode || '').trim();
  const fileId = extractFileId(body.fileId || '');
  if (!sujetCode || !fileId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (sujetCode, fileId)' }) };
  }

  // ── Identité + périmètre : portier client (jeton de session + contact actif + sujet ∈ périmètre marque).
  // Remplace l'authFonction review de drive-download-review. Fail-closed ; statut propagé (401/403/503). ──
  const az = await autoriserMontage(event, { sujetCode });
  if (!az.ok) {
    const msg = az.statut === 403 ? 'Accès refusé' : (az.statut === 401 ? 'Authentification requise' : 'Service temporairement indisponible');
    return { statusCode: az.statut, headers, body: JSON.stringify({ ok: false, error: msg }) };
  }

  // ── Contrôle de cohérence Notion : le fileId doit appartenir au sujet (A ∪ B, TOUTES les versions). On NE
  // fait jamais confiance au fileId de la page ; on re-dérive et on refuse hors liste. (Pas de condition 4.) ──
  let ids;
  try { ids = await fileIdsDuSujet(sujetCode); }
  catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, step: 'notion-lookup', error: e.message }) };
  }
  if (ids === null) {
    return { statusCode: 404, headers, body: JSON.stringify({ ok: false, step: 'notion-lookup', error: 'Sujet introuvable' }) };
  }
  if (!ids.includes(fileId)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, step: 'coherence', error: 'Ce fichier ne correspond pas à ce sujet' }) };
  }

  try {
    const result = await openEphemeralDownload(fileId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true, downloadUrl: result.downloadUrl, revoked: result.revoked,
        file: { id: result.file.id, name: result.file.name, size: result.file.size || null, mimeType: result.file.mimeType }
      })
    };
  } catch (e) {
    if (e.step === 'auth-sa' || e.step === 'registre') {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: e.step, error: e.message }) };
    }
    if (e.step === 'preflight-canshare') {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, step: 'preflight-canshare', error: e.message }) };
    }
    const status = e.httpStatus === 404 ? 404 : (e.httpStatus === 403 ? 403 : 502);
    const friendly = e.httpStatus === 404
      ? 'Fichier introuvable pour le compte de service — vérifier le partage du dossier avec ' + (e.saEmail || '')
      : e.message;
    return {
      statusCode: status, headers,
      body: JSON.stringify({
        ok: false, step: e.step || 'inconnu', httpStatus: e.httpStatus || null,
        error: friendly, google: e.google || null
      })
    };
  }
};
