// netlify/functions/drive-download.js
// Téléchargement direct d'une vidéo Drive "Restreint" via permission éphémère.
// Portier APP INTERNE : contrat inchangé depuis la livraison piste B.
//
// POST { id, code, fileId }
//   1. verifyUser(id, code) via _auth.js — 401 si invalide (fonction JAMAIS ouverte à tous).
//   2. Mécanique piste B via _drive.js (pré-contrôle canShare, permission anyone,
//      registre drive-open-perms, downloadUrl confirm=t, révocation immédiate).
//   3. Renvoie { ok:true, downloadUrl, revoked, file } — le downloadUrl n'est JAMAIS loggé.
//
// La bascule IMMEDIATE_REVOKE vit désormais dans _drive.js (commune aux deux portiers).
//
// Prérequis ops : le dossier racine des vidéos doit être partagé avec l'email du
// Service Account (client_email de GOOGLE_SERVICE_ACCOUNT) en tant qu'ÉDITEUR.

const { verifyUser } = require('./_auth');
const { openEphemeralDownload, extractFileId } = require('./_drive');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const { id, code } = body;
  const fileId = extractFileId(body.fileId || '');
  if (!id || !code || !fileId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (id, code, fileId)' }) };
  }

  // ── Auth utilisateur app (même mécanisme que notify/push-subscribe/auth-token-create) ──
  const auth = await verifyUser({ id, code });
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: auth.error || 'Non autorisé' }) };
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
    // Mise en forme identique au comportement historique de cette fonction.
    if (e.step === 'auth-sa') {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'auth-sa', error: e.message }) };
    }
    if (e.step === 'registre') {
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'registre', error: e.message }) };
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
