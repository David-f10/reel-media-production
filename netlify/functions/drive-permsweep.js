// netlify/functions/drive-permsweep.js
// FILET DE SÉCURITÉ — Scheduled Function (toutes les 10 min, déclarée dans netlify.toml).
// Garantit qu'aucun fichier ne reste public durablement, en ÉPARGNANT les sessions
// de visionnage vivantes (review client) :
//   Couche 1 (registre, TYPE-AWARE) :
//     - entrée type:'view'  → épargnée si isViewAlive (heartbeat < 3 min ET âge < 3 h,
//       le cap dur passe par expiresAt intégré au prédicat) ; sinon révoquée + purgée.
//     - entrée sans type (download) → règle 5 min STRICTEMENT inchangée.
//   Couche 2 (rattrapage) : files.list visibility='anyoneWithLink' — révoque tout
//     fichier public HORS de l'ensemble des sessions vivantes (catch-all des
//     permissions orphelines conservé), avec une ceinture anti-course : re-lecture
//     fraîche du registre avant chaque révocation.
// FAIL-CLOSED : registre (Blobs) indisponible → `vivantes` reste vide et store=null
//   → la couche 2 révoque tout (sécurité d'abord ; les clients ré-ouvrent via le
//   heartbeat alive:false quand le registre revient).
// Logs : uniquement des compteurs (jamais d'URL ni de nom de fichier).
// Rollback : revert de CE seul fichier = comportement précédent restauré.

const { google } = require('googleapis');
const { getDriveOpenPermsStore } = require('./_blobs');
// SOURCE UNIQUE : prédicat et TTL des sessions importés de _drive.js — jamais redéfinis ici.
const { isViewAlive, VIEW_IDLE_TTL_MS, VIEW_MAX_SESSION_MS } = require('./_drive');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOWNLOAD_TTL_MS = 5 * 60 * 1000; // règle download historique (résidu > 5 min = fuite à refermer)

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
  const summary = {
    registreVus: 0, sessionsEpargnees: 0, sessionsRevoquees: 0, downloadsRevoques: 0,
    rattrapageVus: 0, rattrapageEpargnes: 0, rattrapageRevoques: 0, erreurs: 0
  };
  const vivantes = new Set(); // fileId des sessions view VIVANTES — construit AVANT la couche 2

  let token;
  try { token = await getToken(); }
  catch (e) {
    console.error('drive-permsweep: auth SA échouée —', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }

  // ── Couche 1 : le registre, type-aware ──
  let store = null;
  try {
    store = getDriveOpenPermsStore();
    const listing = await store.list();
    const blobs = listing?.blobs || [];
    const now = Date.now();
    for (const b of blobs) {
      summary.registreVus++;
      try {
        const entry = await store.get(b.key, { type: 'json' });
        if (!entry) { await store.delete(b.key).catch(() => {}); continue; }

        if (entry.type === 'view') {
          // Vivante = heartbeat < VIEW_IDLE_TTL_MS ET sous le cap VIEW_MAX_SESSION_MS
          // (les deux sont intégrés à isViewAlive via lastSeen et expiresAt).
          if (isViewAlive(entry, now)) {
            vivantes.add(entry.fileId || b.key);
            summary.sessionsEpargnees++;
            continue; // ÉPARGNÉE — on ne coupe jamais un spectateur actif
          }
          await revokeAnyone(token, entry.fileId || b.key, entry.permissionId || null);
          await store.delete(b.key).catch(() => {});
          summary.sessionsRevoquees++;
          continue;
        }

        // Entrée sans type = download : règle historique 5 min STRICTEMENT inchangée
        if (typeof entry.openedAt === 'number' && (now - entry.openedAt) < DOWNLOAD_TTL_MS) continue;
        await revokeAnyone(token, entry.fileId || b.key, entry.permissionId || null);
        await store.delete(b.key).catch(() => {});
        summary.downloadsRevoques++;
      } catch (e) {
        summary.erreurs++;
        console.warn('drive-permsweep: échec registre sur une entrée —', e.httpStatus || '', e.message);
      }
    }
  } catch (e) {
    // FAIL-CLOSED : registre inaccessible → `vivantes` reste vide, store=null
    // → la couche 2 révoque tout (les clients ré-ouvriront quand Blobs revient).
    summary.erreurs++;
    store = null;
    console.warn('drive-permsweep: registre inaccessible (fail-closed) —', e.message);
  }

  // ── Couche 2 : rattrapage des publics non trackés (best-effort, bornée à 100) ──
  try {
    const q = encodeURIComponent("visibility='anyoneWithLink' and trashed=false");
    const found = await gapi(token, 'GET',
      `/files?q=${q}&fields=files(id)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    const files = found.files || [];
    summary.rattrapageVus = files.length;
    for (const f of files) {
      if (vivantes.has(f.id)) { summary.rattrapageEpargnes++; continue; }
      // Ceinture anti-course : une session a pu s'ouvrir PENDANT ce passage —
      // re-lecture fraîche du registre avant de révoquer (si le store est joignable).
      if (store) {
        const entry = await store.get(f.id, { type: 'json' }).catch(() => null);
        if (isViewAlive(entry, Date.now())) { summary.rattrapageEpargnes++; continue; }
      }
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
