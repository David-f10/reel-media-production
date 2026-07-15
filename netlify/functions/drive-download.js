// netlify/functions/drive-download.js
// Téléchargement direct d'une vidéo Drive "Restreint" via permission éphémère.
//
// POST { id, code, fileId }
//   1. verifyUser(id, code) via _auth.js — 401 si invalide (fonction JAMAIS ouverte à tous).
//   2. Via Service Account (scope drive complet) : métadonnées + pré-contrôle canShare.
//   3. permissions.create(anyone, reader) — enregistrée dans Blobs AVANT toute suite,
//      pour que drive-permsweep referme si l'exécution plante en cours de route.
//   4. Construit le downloadUrl public (drive.usercontent.google.com, confirm=t).
//   5. Révoque IMMÉDIATEMENT la permission (fenêtre publique ≈ quelques centaines de ms),
//      puis retire l'entrée du registre.
//   6. Renvoie { ok:true, downloadUrl, file } — le downloadUrl n'est JAMAIS loggé.
//
// ⚠️ IMMEDIATE_REVOKE : si le test preview montre que le lien ne survit pas à la
// révocation (contrôle d'accès Google au démarrage du téléchargement), passer cette
// constante à false : la permission reste alors ouverte et c'est drive-permsweep
// (TTL 5 min, passage toutes les 10 min) qui referme.
//
// Prérequis ops : le dossier racine des vidéos doit être partagé avec l'email du
// Service Account (client_email de GOOGLE_SERVICE_ACCOUNT) en tant qu'ÉDITEUR.

const { google } = require('googleapis');
const { verifyUser } = require('./_auth');
const { getDriveOpenPermsStore } = require('./_blobs');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const IMMEDIATE_REVOKE = true;

function extractFileId(raw) {
  if (!raw) return '';
  const m = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(raw) ? raw : '';
}

async function getSA() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  // Scope complet requis pour permissions.create/delete (drive.js reste en readonly).
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Impossible d’obtenir un access token Service Account');
  return { token, saEmail: credentials.client_email || '' };
}

async function gapi(token, method, path, step, jsonBody) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {})
    },
    ...(jsonBody ? { body: JSON.stringify(jsonBody) } : {})
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { /* corps non-JSON gardé brut */ } }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.step = step;
    err.httpStatus = res.status;
    err.google = data?.error || { raw: String(text).slice(0, 500) };
    throw err;
  }
  return data;
}

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

  let sa;
  try { sa = await getSA(); }
  catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'auth-sa', error: e.message }) };
  }

  let store = null;
  try { store = getDriveOpenPermsStore(); }
  catch (e) {
    // Sans registre, pas de filet de sécurité : on refuse d'ouvrir une permission publique.
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'registre', error: 'Registre indisponible : ' + e.message }) };
  }

  let file = null;
  try {
    // ── Pré-contrôle : accès + droit de partage ──
    file = await gapi(sa.token, 'GET',
      `/files/${fileId}?fields=id,name,size,mimeType,capabilities(canShare)&supportsAllDrives=true`, 'metadata');

    if (file.capabilities && file.capabilities.canShare === false) {
      return {
        statusCode: 403, headers,
        body: JSON.stringify({
          ok: false, step: 'preflight-canshare',
          error: 'Fichier non partageable par le compte de service — partager le dossier des vidéos avec ' +
            sa.saEmail + ' en tant qu’Éditeur.'
        })
      };
    }

    // ── Ouverture, avec journalisation AVANT toute suite ──
    const perm = await gapi(sa.token, 'POST',
      `/files/${fileId}/permissions?supportsAllDrives=true`, 'permission-create',
      { type: 'anyone', role: 'reader' });

    await store.setJSON(fileId, { fileId, permissionId: perm.id, openedAt: Date.now() });

    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

    // ── Révocation immédiate + sortie du registre ──
    let revoked = false;
    if (IMMEDIATE_REVOKE) {
      try {
        await gapi(sa.token, 'DELETE',
          `/files/${fileId}/permissions/${perm.id}?supportsAllDrives=true`, 'permission-revoke');
        revoked = true;
        await store.delete(fileId).catch(() => {});
      } catch (e) {
        // Révocation échouée : l'entrée RESTE dans le registre → drive-permsweep refermera.
        console.warn('drive-download: révocation immédiate échouée, rattrapage par le sweep', e.httpStatus || '', e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true, downloadUrl, revoked,
        file: { id: file.id, name: file.name, size: file.size || null, mimeType: file.mimeType }
      })
    };
  } catch (e) {
    const status = e.httpStatus === 404 ? 404 : (e.httpStatus === 403 ? 403 : 502);
    const friendly = e.httpStatus === 404
      ? 'Fichier introuvable pour le compte de service — vérifier le partage du dossier avec ' + sa.saEmail
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
