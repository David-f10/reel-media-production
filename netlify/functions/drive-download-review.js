// netlify/functions/drive-download-review.js
// Téléchargement direct depuis la page review.html (client externe, SANS compte app).
// Portier REVIEW : pas de verifyUser — la sécurité repose sur la cohérence Notion :
// le serveur RE-DÉRIVE lui-même les fileId autorisés depuis l'UNION des deux
// systèmes de stockage des versions, et refuse tout fileId hors de cette liste.
// On ne fait jamais confiance au ?url= de la page.
//
//   Source A : propriétés Lien V1/V2/V3 (url) du sujet (base 🎬 Suivi de Production)
//              — alimentées par la vue tableau de production.
//   Source B : pages de la base 📹 Versions dont Sujet ID = l'id de page du sujet,
//              Titre (title) = l'URL Drive — alimentées par la fiche détail.
//              Versions Annulées INCLUSES (un client peut retélécharger une
//              version qu'on lui a déjà montrée) : pas de filtre Statut.
//
// POST { sujetCode, fileId }
//   → 404 si aucun sujet ne porte ce code
//   → 403 si le fileId n'apparaît NI en source A NI en source B
//   → sinon mécanique piste B via _drive.js (registre + révocation immédiate +
//     rattrapage drive-permsweep, identiques au portier app)
//   → { ok:true, downloadUrl, revoked, file } — le downloadUrl n'est JAMAIS loggé.
//
// Appelle l'API Notion en direct avec NOTION_TOKEN (comme _auth.js / notify.js),
// pas via le proxy notion.js.

const { openEphemeralDownload, extractFileId } = require('./_drive');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';

// Helper interne : POST /databases/{id}/query avec NOTION_TOKEN.
async function notionQuery(databaseId, body) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN manquant');
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Notion query: HTTP ' + res.status);
  return res.json();
}

// fileIds autorisés = UNION source A ∪ source B. Renvoie null si sujet introuvable.
async function fileIdsDuSujet(sujetCode) {
  // ── Source A : le sujet (fournit aussi son id de page pour la source B) ──
  const data = await notionQuery(DB_PROD, {
    filter: { property: 'Code', rich_text: { equals: sujetCode } },
    page_size: 5
  });
  const page = data.results && data.results[0];
  if (!page) return null;
  const pr = page.properties;
  const ids = ['Lien V1', 'Lien V2', 'Lien V3']
    .map(k => extractFileId(pr[k]?.url || ''))
    .filter(Boolean);

  // ── Source B : pages 📹 Versions liées au sujet (Annulées incluses) ──
  // Pagination triviale bornée (5 × 100 versions — jamais atteint en pratique).
  let cursor = null, pages = 0;
  do {
    const body = { filter: { property: 'Sujet ID', rich_text: { equals: page.id } }, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const vData = await notionQuery(DB_VERSIONS, body);
    for (const v of vData.results || []) {
      // Titre est une propriété title : concaténer TOUS les fragments plain_text
      // (Notion peut découper une URL longue en plusieurs fragments).
      const titre = (v.properties?.Titre?.title || []).map(t => t.plain_text || '').join('');
      const fid = extractFileId(titre);
      if (fid) ids.push(fid);
    }
    cursor = vData.has_more ? vData.next_cursor : null;
    pages++;
  } while (cursor && pages < 5);

  return ids;
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

  // ── Contrôle de cohérence Notion : le fileId doit appartenir au sujet (A ∪ B) ──
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
