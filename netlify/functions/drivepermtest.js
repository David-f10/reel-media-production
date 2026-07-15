// netlify/functions/drivepermtest.js
// SPIKE DE VALIDATION — PISTE B « permission éphémère ». NE PAS DÉPLOYER EN PROD FINALE.
// Objectif : prouver la mécanique  ouvrir (permission anyone) → lien public qui
// télécharge → re-fermer (révocation)  sur les vraies vidéos, via le Service Account.
//
// ⚠️ PRÉREQUIS CÔTÉ DRIVE (sinon 403 insufficientFilePermissions à l'étape permission-create) :
//   le dossier des vidéos doit être partagé avec l'email du Service Account en tant
//   qu'ÉDITEUR (l'email est renvoyé dans le champ saEmail de chaque réponse).
//   Le scope OAuth 'drive' (complet) est demandé ici au moment du jeton — aucune
//   configuration Google à changer, c'est le partage Drive qui donne (ou pas) le droit.
//
// Usage (test) :
//   Étape 1 — ouvrir + générer le lien :
//     GET /.netlify/functions/drivepermtest?fileId=XXXX          (ID ou URL Drive complète)
//     → { ok:true, permissionId, downloadUrl, altUrl, file, saEmail }
//   Étape 2 — re-fermer (révocation manuelle, séparée exprès pour le test) :
//     GET /.netlify/functions/drivepermtest?fileId=XXXX&revoke=PERMISSION_ID
//     → { ok:true, revoked:true, confirmedGone:true }
//
// ⚠️ Fonction de TEST sans auth app — à sécuriser avant toute version définitive.

const { google } = require('googleapis');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

function extractFileId(raw) {
  if (!raw) return '';
  const m = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(raw) ? raw : '';
}

function getCredentials() {
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
}

async function getAccessToken(credentials) {
  // Scope 'drive' complet : nécessaire pour permissions.create/delete.
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Impossible d’obtenir un access token Service Account');
  return token;
}

// Appel API Google avec diagnostic : toute erreur porte step, httpStatus et le corps
// d'erreur Google complet (error.code, error.message, error.status, error.errors[]).
async function gapi(token, method, path, step, jsonBody) {
  let res, text;
  try {
    res = await fetch(`${DRIVE_API}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(jsonBody ? { 'Content-Type': 'application/json' } : {})
      },
      ...(jsonBody ? { body: JSON.stringify(jsonBody) } : {})
    });
    text = await res.text();
  } catch (e) {
    const err = new Error(`Appel réseau vers Google échoué : ${e.message}`);
    err.step = step;
    throw err;
  }
  // DELETE renvoie un corps vide en cas de succès.
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { /* gardé brut ci-dessous */ } }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.step = step;
    err.httpStatus = res.status;
    err.google = data?.error || { raw: String(text).slice(0, 1000) };
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

  const started = Date.now();

  let credentials;
  try { credentials = getCredentials(); }
  catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'auth-sa', error: 'GOOGLE_SERVICE_ACCOUNT illisible : ' + e.message }) };
  }
  const saEmail = credentials.client_email || '(client_email absent du JSON)';

  const reply = (statusCode, payload) =>
    ({ statusCode, headers, body: JSON.stringify({ ...payload, saEmail, elapsedMs: Date.now() - started }) });

  let params = event.queryStringParameters || {};
  if (event.httpMethod === 'POST') {
    try { params = { ...params, ...JSON.parse(event.body || '{}') }; }
    catch { return reply(400, { ok: false, step: 'input', error: 'JSON invalide' }); }
  }

  const fileId = extractFileId(params.fileId || params.url || '');
  if (!fileId) return reply(400, { ok: false, step: 'input', error: 'fileId manquant ou invalide (ID Drive ou URL /file/d/...)' });

  let token;
  try { token = await getAccessToken(credentials); }
  catch (e) { return reply(500, { ok: false, step: 'auth-sa', error: 'Auth Service Account échouée : ' + e.message }); }

  let file = null;
  try {
    // ── Mode révocation : ?fileId=X&revoke=PERMISSION_ID ──
    if (params.revoke) {
      await gapi(token, 'DELETE',
        `/files/${fileId}/permissions/${params.revoke}?supportsAllDrives=true`, 'permission-revoke');

      // Contre-vérification : la permission ne doit plus exister (404 attendu).
      let confirmedGone = false;
      try {
        await gapi(token, 'GET',
          `/files/${fileId}/permissions/${params.revoke}?supportsAllDrives=true`, 'revoke-verify');
      } catch (e) {
        if (e.httpStatus === 404) confirmedGone = true;
        else throw e;
      }
      return reply(200, { ok: true, revoked: true, confirmedGone, fileId });
    }

    // ── Mode ouverture : métadonnées + pré-contrôle canShare ──
    file = await gapi(token, 'GET',
      `/files/${fileId}?fields=id,name,size,mimeType,capabilities(canShare)&supportsAllDrives=true`, 'metadata');

    if (file.capabilities && file.capabilities.canShare === false) {
      return reply(403, {
        ok: false, step: 'preflight-canshare', file,
        error: 'Le Service Account voit ce fichier mais n’a PAS le droit d’en modifier les permissions. ' +
          'Partager le dossier des vidéos avec ' + saEmail + ' en tant qu’ÉDITEUR, puis retester.'
      });
    }

    // ── Création de la permission publique « anyone / reader » ──
    const perm = await gapi(token, 'POST',
      `/files/${fileId}/permissions?supportsAllDrives=true`, 'permission-create',
      { type: 'anyone', role: 'reader' });

    // Liens de téléchargement public. Le format usercontent est le canal actuel de Google ;
    // confirm=t saute l'interstitiel « fichier trop volumineux pour l'analyse antivirus ».
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const altUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

    return reply(200, {
      ok: true,
      permissionId: perm.id,
      downloadUrl,
      altUrl,
      file, // {id, name, size, mimeType, capabilities}
      revokeHint: `Pour re-fermer : ?fileId=${fileId}&revoke=${perm.id}`
    });
  } catch (e) {
    const status = e.httpStatus === 404 ? 404 : (e.httpStatus === 403 ? 403 : 502);
    return reply(status, {
      ok: false,
      step: e.step || 'inconnu',
      httpStatus: e.httpStatus || null,
      error: e.message,
      google: e.google || null,
      file
    });
  }
};
