// netlify/functions/drive-download-test.js
// SPIKE DE VALIDATION — NE PAS DÉPLOYER EN L'ÉTAT SUR MAIN.
// Objectif : prouver que files.download (API Drive v3, opération long-running)
// fournit un downloadUri utilisable SANS authentification côté client, via le
// Service Account existant (GOOGLE_SERVICE_ACCOUNT, scope drive.readonly),
// sur un fichier "Restreint" de plusieurs Go — sans faire transiter les octets
// par Netlify.
//
// Usage (test) :
//   GET  /.netlify/functions/drive-download-test?fileId=XXXX
//   GET  /.netlify/functions/drive-download-test?fileId=<URL Drive complète encodée>
//   POST /.netlify/functions/drive-download-test  {"fileId":"XXXX"}
//   Si l'opération n'est pas prête à temps :
//   GET  /.netlify/functions/drive-download-test?operation=operations/xyz  (re-poll)
//
// Réponses :
//   { ok:true, downloadUri, file:{name,size}, elapsedMs, polls }
//   { ok:false, pending:true, operation, file, hint }   → rappeler avec ?operation=
//   { ok:false, error }
//
// ⚠️ Aucune auth utilisateur app : TEST UNIQUEMENT. Le downloadUri n'est jamais loggé.

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

async function gapi(token, method, path) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Réponse non-JSON de ${path} (HTTP ${res.status})`); }
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Extrait le downloadUri d'une Operation, où qu'il soit exposé selon la révision de l'API.
function downloadUriFromOperation(op) {
  return op?.response?.downloadUri || op?.metadata?.downloadUri || null;
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
    catch { return reply(400, { ok: false, error: 'JSON invalide' }); }
  }

  let token;
  try { token = await getAccessToken(); }
  catch (e) { return reply(500, { ok: false, error: 'Auth Service Account échouée : ' + e.message }); }

  try {
    // Mode re-poll : ?operation=operations/xyz (opération déjà lancée lors d'un appel précédent)
    let op = null;
    let file = null;
    let polls = 0;

    if (params.operation) {
      op = await gapi(token, 'GET', `/${params.operation}`);
    } else {
      const fileId = extractFileId(params.fileId || params.url || '');
      if (!fileId) return reply(400, { ok: false, error: 'fileId manquant ou invalide (ID Drive ou URL /file/d/...)' });

      // Métadonnées d'abord : confirme l'accès du SA + donne la taille attendue pour le test.
      file = await gapi(token, 'GET',
        `/files/${fileId}?fields=id,name,size,mimeType&supportsAllDrives=true`);

      // Lancement de l'opération long-running de téléchargement.
      op = await gapi(token, 'POST', `/files/${fileId}/download`);
    }

    // Polling borné pour rester sous le timeout de la function.
    while (!op.done && polls < MAX_POLLS) {
      await sleep(POLL_DELAY_MS);
      polls++;
      op = await gapi(token, 'GET', `/${op.name}`);
    }

    if (op.error) {
      return reply(502, { ok: false, error: `Opération en échec : ${op.error.message || JSON.stringify(op.error)}`, polls });
    }

    if (!op.done) {
      return reply(200, {
        ok: false, pending: true, operation: op.name, file, polls,
        hint: 'Opération pas encore prête — rappeler cette function avec ?operation=' + op.name
      });
    }

    const downloadUri = downloadUriFromOperation(op);
    if (!downloadUri) {
      // Opération terminée mais sans URI : renvoyer les clés présentes (sans valeurs) pour diagnostiquer.
      return reply(502, {
        ok: false, polls,
        error: 'Opération terminée mais downloadUri introuvable. Clés response=' +
          JSON.stringify(Object.keys(op.response || {})) + ' metadata=' + JSON.stringify(Object.keys(op.metadata || {}))
      });
    }

    return reply(200, { ok: true, downloadUri, file, polls });
  } catch (e) {
    const status = e.status === 404 ? 404 : (e.status === 403 ? 403 : 502);
    return reply(status, { ok: false, error: e.message });
  }
};
