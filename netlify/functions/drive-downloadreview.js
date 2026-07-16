// netlify/functions/drive-download-review.js
// Téléchargement direct depuis la page review.html (client externe, SANS compte app).
// Portier REVIEW : pas de verifyUser — la sécurité repose sur la cohérence Notion :
// le serveur RE-DÉRIVE lui-même les fileId depuis les propriétés Lien V1/V2/V3 du
// sujet portant le code fourni. Un fileId hors de cette liste → 403. On ne fait
// jamais confiance au ?url= de la page.
//
// POST { sujetCode, fileId }
//   → 404 si aucun sujet ne porte ce code
//   → 403 si le fileId ne correspond à aucun Lien V1/V2/V3 du sujet
//   → sinon mécanique piste B via _drive.js (registre + révocation immédiate +
//     rattrapage drive-permsweep, identiques au portier app)
//   → { ok:true, downloadUrl, revoked, file } — le downloadUrl n'est JAMAIS loggé.
//
// Appelle l'API Notion en direct avec NOTION_TOKEN (comme _auth.js / notify.js),
// pas via le proxy notion.js.

const { openEphemeralDownload, extractFileId } = require('./_drive');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';

// Renvoie la liste des fileId des Lien V1/V2/V3 du sujet, ou null si sujet introuvable.
async function fileIdsDuSujet(sujetCode) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN manquant');
  const res = await fetch(`https://api.notion.com/v1/databases/${DB_PROD}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: { property: 'Code', rich_text: { equals: sujetCode } },
      page_size: 5
    })
  });
  if (!res.ok) throw new Error('Notion query: HTTP ' + res.status);
  const data = await res.json();
  const page = data.results && data.results[0];
  if (!page) return null;
  const pr = page.properties;
  return ['Lien V1', 'Lien V2', 'Lien V3']
    .map(k => extractFileId(pr[k]?.url || ''))
    .filter(Boolean);
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

  const sujetCode = String(body.sujetCode || '').trim();
  const fileId = extractFileId(body.fileId || '');
  if (!sujetCode || !fileId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (sujetCode, fileId)' }) };
  }

  // ── Contrôle de cohérence Notion : le fileId doit appartenir au sujet ──
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
