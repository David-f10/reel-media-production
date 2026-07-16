// netlify/functions/_drive.js
// Mécanique commune « permission éphémère » (piste B), partagée par :
//   - drive-download.js        (app interne, authentifiée par verifyUser)
//   - drive-download-review.js (page review client, authentifiée par cohérence Notion)
// Le préfixe '_' évite que ce fichier soit exposé comme function Netlify.
//
// openEphemeralDownload(fileId) déroule le cycle complet :
//   pré-contrôle canShare → permissions.create(anyone, reader) → écriture au
//   registre Blobs "drive-open-perms" (write-ahead pour le sweep) → construction
//   du downloadUrl (usercontent, confirm=t) → révocation immédiate → sortie du
//   registre. Si la révocation échoue, l'entrée RESTE au registre et
//   drive-permsweep referme (TTL 5 min, passage toutes les 10 min).
//
// ⚠️ IMMEDIATE_REVOKE : si un test montre que le lien ne survit pas à la
// révocation, passer à false : la permission reste ouverte et c'est le sweep
// qui referme. Une seule bascule pour les deux portiers.
//
// Les erreurs jetées portent : step, httpStatus, google (corps d'erreur Google
// complet) et saEmail (pour les messages d'aide au partage). Le downloadUrl
// n'est JAMAIS loggé.

const { google } = require('googleapis');
const { getDriveOpenPermsStore } = require('./_blobs');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const IMMEDIATE_REVOKE = true;

function extractFileId(raw) {
  if (!raw) return '';
  const m = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Format alternatif : drive.google.com/open?id=XXX (aligné sur getDriveFileId d'index.html)
  const m2 = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
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

async function openEphemeralDownload(fileId) {
  let sa;
  try { sa = await getSA(); }
  catch (e) { e.step = 'auth-sa'; throw e; }

  let store;
  try { store = getDriveOpenPermsStore(); }
  catch (e) {
    // Sans registre, pas de filet de sécurité : on refuse d'ouvrir une permission publique.
    const err = new Error('Registre indisponible : ' + e.message);
    err.step = 'registre';
    err.saEmail = sa.saEmail;
    throw err;
  }

  try {
    // ── Pré-contrôle : accès + droit de partage ──
    const file = await gapi(sa.token, 'GET',
      `/files/${fileId}?fields=id,name,size,mimeType,capabilities(canShare)&supportsAllDrives=true`, 'metadata');

    if (file.capabilities && file.capabilities.canShare === false) {
      const err = new Error('Fichier non partageable par le compte de service — partager le dossier des vidéos avec ' +
        sa.saEmail + ' en tant qu’Éditeur.');
      err.step = 'preflight-canshare';
      err.httpStatus = 403;
      err.saEmail = sa.saEmail;
      throw err;
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
        console.warn('openEphemeralDownload: révocation immédiate échouée, rattrapage par le sweep', e.httpStatus || '', e.message);
      }
    }

    return { downloadUrl, revoked, file, saEmail: sa.saEmail };
  } catch (e) {
    if (!e.saEmail) e.saEmail = sa.saEmail;
    throw e;
  }
}

module.exports = { openEphemeralDownload, extractFileId, getSA, gapi, IMMEDIATE_REVOKE };
