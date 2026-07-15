// netlify/functions/drive-permsweep.js
// FILET DE SÉCURITÉ — Scheduled Function (toutes les 10 min, déclarée dans netlify.toml).
// Garantit qu'aucun fichier ne reste public durablement :
//   Couche 1 (registre) : révoque toute permission du registre Blobs "drive-open-perms"
//     plus vieille que TTL_MS (l'entrée n'existe que si drive-download a planté avant
//     sa révocation immédiate, ou si celle-ci a échoué).
//   Couche 2 (rattrapage) : files.list visibility='anyoneWithLink' — détecte les fichiers
//     publics visibles du Service Account MÊME hors registre, et révoque leurs
//     permissions "anyone". Best-effort, bornée, ne fait jamais échouer la couche 1.
// Logs : uniquement des compteurs (jamais d'URL ni de nom de fichier).

const { google } = require('googleapis');
const { getDriveOpenPermsStore } = require('./_blobs');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TTL_MS = 5 * 60 * 1000; // 5 min : au-delà, une entrée du registre est une fuite à refermer

async function getToken() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Access token Service Account indisponible');
  return token;
}

async function gapi(token, method, path, jsonBody) {
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
  if (text) { try { data = JSON.parse(text); } catch { /* ignore */ } }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return data;
}

// Révoque toutes les permissions type=anyone d'un fichier. 404 = déjà fermé (succès).
async function revokeAnyone(token, fileId, knownPermissionId) {
  if (knownPermissionId) {
    try {
      await gapi(token, 'DELETE', `/files/${fileId}/permissions/${knownPermissionId}?supportsAllDrives=true`);
      return true;
    } catch (e) {
      if (e.httpStatus === 404) return true;
      // permissionId inconnu/invalide : on retombe sur la liste complète ci-dessous.
    }
  }
  const list = await gapi(token, 'GET', `/files/${fileId}/permissions?fields=permissions(id,type)&supportsAllDrives=true`);
  const anyones = (list.permissions || []).filter(p => p.type === 'anyone');
  for (const p of anyones) {
    try { await gapi(token, 'DELETE', `/files/${fileId}/permissions/${p.id}?supportsAllDrives=true`); }
    catch (e) { if (e.httpStatus !== 404) throw e; }
  }
  return true;
}

exports.handler = async () => {
  const summary = { registreVus: 0, registreRevoques: 0, rattrapageVus: 0, rattrapageRevoques: 0, erreurs: 0 };

  let token;
  try { token = await getToken(); }
  catch (e) {
    console.error('drive-permsweep: auth SA échouée —', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }

  // ── Couche 1 : le registre ──
  try {
    const store = getDriveOpenPermsStore();
    const listing = await store.list();
    const blobs = listing?.blobs || [];
    const now = Date.now();
    for (const b of blobs) {
      summary.registreVus++;
      try {
        const entry = await store.get(b.key, { type: 'json' });
        if (!entry) { await store.delete(b.key).catch(() => {}); continue; }
        if (typeof entry.openedAt === 'number' && (now - entry.openedAt) < TTL_MS) continue; // encore dans la fenêtre
        await revokeAnyone(token, entry.fileId || b.key, entry.permissionId || null);
        await store.delete(b.key).catch(() => {});
        summary.registreRevoques++;
      } catch (e) {
        summary.erreurs++;
        console.warn('drive-permsweep: échec registre sur une entrée —', e.httpStatus || '', e.message);
      }
    }
  } catch (e) {
    summary.erreurs++;
    console.warn('drive-permsweep: registre inaccessible —', e.message);
  }

  // ── Couche 2 : rattrapage des publics non trackés (best-effort, bornée à 100) ──
  try {
    const q = encodeURIComponent("visibility='anyoneWithLink' and trashed=false");
    const found = await gapi(token, 'GET',
      `/files?q=${q}&fields=files(id)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    const files = found.files || [];
    summary.rattrapageVus = files.length;
    for (const f of files) {
      try {
        await revokeAnyone(token, f.id, null);
        summary.rattrapageRevoques++;
      } catch (e) {
        summary.erreurs++;
        console.warn('drive-permsweep: échec rattrapage sur un fichier —', e.httpStatus || '', e.message);
      }
    }
  } catch (e) {
    // Couche best-effort : ne fait jamais échouer le passage.
    console.warn('drive-permsweep: rattrapage indisponible —', e.message);
  }

  console.log('drive-permsweep:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...summary }) };
};
