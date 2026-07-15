// netlify/functions/drivedownloadtest.js
// SPIKE DE VALIDATION — VERSION DIAGNOSTIC. NE PAS DÉPLOYER EN L'ÉTAT EN PROD FINALE.
// Objectif : prouver que files.download (API Drive v3, opération long-running)
// fournit un downloadUri utilisable SANS authentification côté client, via le
// Service Account existant (GOOGLE_SERVICE_ACCOUNT, scope drive.readonly).
//
// Version diagnostic : en cas d'échec, la réponse HTTP contient le détail COMPLET
// de l'erreur Google (status HTTP, error.code/message/status, errors[] reason/domain)
// et l'ÉTAPE qui a échoué : 'auth-sa' | 'metadata' | 'download-start' | 'operation-poll'.
//
// Usage (test) :
//   GET  /.netlify/functions/drivedownloadtest?fileId=XXXX
//   GET  /.netlify/functions/drivedownloadtest?fileId=<URL Drive complète encodée>
//   POST /.netlify/functions/drivedownloadtest  {"fileId":"XXXX"}
//   Re-poll si pending : GET ...?operation=operations/xyz
//
// ⚠️ Aucune auth utilisateur app : TEST UNIQUEMENT.
// Le downloadUri n'est jamais loggé (présent uniquement dans la réponse de succès).

const { google } = require('googleapis');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
// Budget de polling : rester sous le timeout des functions (10 s par défaut).
const MAX_POLLS = 7;
const POLL_DELAY_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractFileId(raw) {
  if (!raw) return '';
  const m = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(raw) ? raw : '';
}

async function getAccessToken() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Impossible d’obtenir un access token Service Account');
  return token;
}

// Appel API Google avec diagnostic : toute erreur porte step, httpStatus et le corps
// d'erreur Google complet (error.code, error.message, error.status, error.errors[]).
async function gapi(token, method, path, step) {
  let res, text;
  try {
    res = await fetch(`${DRIVE_API}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${token}` }
    });
    text = await res.text();
  } catch (e) {
    const err = new Error(`Appel réseau vers Google échoué : ${e.message}`);
    err.step = step;
    throw err;
  }
  let data = null;
  try { data = JSON.parse(text); } catch { /* corps non-JSON, gardé brut ci-dessous */ }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.step = step;
    err.httpStatus = res.status;
    // Corps d'erreur Google complet si JSON, sinon extrait brut (tronqué).
    err.google = data?.error || { raw: String(text).slice(0, 1000) };
    throw err;
  }
  if (data === null) {
    const err = new Error(`Réponse non-JSON de Google (HTTP ${res.status})`);
    err.step = step;
    err.httpStatus = res.status;
    err.google = { raw: String(text).slice(0, 1000) };
    throw err;
  }
  return data;
}

// Extrait le downloadUri d'une Operation, où qu'il soit exposé selon la révision de l'API.
function downloadUriFromOperation(op) {
  return op?.response?.downloadUri || op?.metadata?.downloadUri || null;
}

// Les fichiers Google natifs (Docs/Sheets/Slides...) n'ont pas de binaire : files.download
// sans mimeType d'export échoue dessus (parfois en "internal error" peu explicite).
function nativeGoogleFileWarning(file) {
  if (file?.mimeType?.startsWith('application/vnd.google-apps.')) {
    return 'Fichier Google natif (' + file.mimeType + ') : pas de contenu binaire téléchargeable ' +
      'directement — files.download exige un mimeType d’export pour ce type. ' +
      'Un internalError/erreur sur ce fichier n’est PAS représentatif des vidéos.';
  }
  return null;
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
  const reply = (statusCode, payload) =>
    ({ statusCode, headers, body: JSON.stringify({ ...payload, elapsedMs: Date.now() - started }) });

  let params = event.queryStringParameters || {};
  if (event.httpMethod === 'POST') {
    try { params = { ...params, ...JSON.parse(event.body || '{}') }; }
    catch { return reply(400, { ok: false, step: 'input', error: 'JSON invalide' }); }
  }

  let token;
  try { token = await getAccessToken(); }
  catch (e) {
    return reply(500, { ok: false, step: 'auth-sa', error: 'Auth Service Account échouée : ' + e.message });
  }

  let file = null;
  try {
    // Mode re-poll : ?operation=operations/xyz (opération déjà lancée lors d'un appel précédent)
    let op = null;
    let polls = 0;

    if (params.operation) {
      op = await gapi(token, 'GET', `/${params.operation}`, 'operation-poll');
    } else {
      const fileId = extractFileId(params.fileId || params.url || '');
      if (!fileId) return reply(400, { ok: false, step: 'input', error: 'fileId manquant ou invalide (ID Drive ou URL /file/d/...)' });

      // Métadonnées d'abord : confirme l'accès du SA + taille/mimeType attendus.
      file = await gapi(token, 'GET',
        `/files/${fileId}?fields=id,name,size,mimeType&supportsAllDrives=true`, 'metadata');

      // Lancement de l'opération long-running de téléchargement.
      op = await gapi(token, 'POST', `/files/${fileId}/download`, 'download-start');
    }

    // Polling borné pour rester sous le timeout de la function.
    while (!op.done && polls < MAX_POLLS) {
      await sleep(POLL_DELAY_MS);
      polls++;
      op = await gapi(token, 'GET', `/${op.name}`, 'operation-poll');
    }

    if (op.error) {
      // Erreur portée par l'opération elle-même (format google.rpc.Status : code/message/details).
      return reply(502, {
        ok: false, step: 'operation-result', polls, file,
        warning: nativeGoogleFileWarning(file),
        error: op.error.message || 'Opération en échec',
        google: op.error
      });
    }

    if (!op.done) {
      return reply(200, {
        ok: false, pending: true, step: 'operation-poll', operation: op.name, file, polls,
        hint: 'Opération pas encore prête — rappeler cette function avec ?operation=' + op.name
      });
    }

    const downloadUri = downloadUriFromOperation(op);
    if (!downloadUri) {
      return reply(502, {
        ok: false, step: 'operation-result', polls, file,
        warning: nativeGoogleFileWarning(file),
        error: 'Opération terminée mais downloadUri introuvable. Clés response=' +
          JSON.stringify(Object.keys(op.response || {})) + ' metadata=' + JSON.stringify(Object.keys(op.metadata || {}))
      });
    }

    return reply(200, {
      ok: true, downloadUri, polls,
      file, // {id, name, size, mimeType}
      warning: nativeGoogleFileWarning(file)
    });
  } catch (e) {
    const status = e.httpStatus === 404 ? 404 : (e.httpStatus === 403 ? 403 : 502);
    return reply(status, {
      ok: false,
      step: e.step || 'inconnu',
      httpStatus: e.httpStatus || null,
      error: e.message,
      google: e.google || null,
      file,
      warning: nativeGoogleFileWarning(file)
    });
  }
};
