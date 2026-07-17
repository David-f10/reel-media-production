// netlify/functions/videospiketest.js
// MINI-SPIKE JETABLE — NE JAMAIS MERGER EN PROD (branche dédiée, PR fermée sans merge).
// But unique : valider qu'une vidéo Drive "Restreint" se lit et se seek dans un
// <video> HTML5 via l'URL usercontent, une fois une permission anyone ouverte.
//
// Usage :
//   Ouvrir  : GET /.netlify/functions/videospiketest?fileId=<ID ou URL Drive>
//             → { ok, permissionId, streamUrl, file, revokeHint }
//   Fermer  : GET /.netlify/functions/videospiketest?fileId=<ID>&revoke=<PERMISSION_ID>
//             → { ok, revoked:true, confirmedGone:true }
//
// Réutilise les exports EXISTANTS de _drive.js (getSA, gapi, extractFileId) sans
// les modifier. Aucune écriture au registre (test manuel, hors mécanique de prod) —
// le sweep de prod (couche anyoneWithLink) refermera de toute façon toute
// permission oubliée sous ~10 min. Le streamUrl n'est jamais loggé.

const { getSA, gapi, extractFileId } = require('./_drive');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const params = event.queryStringParameters || {};
  const fileId = extractFileId(params.fileId || '');
  if (!fileId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'fileId manquant ou invalide (ID Drive ou URL /file/d/...)' }) };
  }

  let sa;
  try { sa = await getSA(); }
  catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'auth-sa', error: e.message }) };
  }

  try {
    // ── Mode fermeture : ?fileId=X&revoke=PERMISSION_ID ──
    if (params.revoke) {
      await gapi(sa.token, 'DELETE',
        `/files/${fileId}/permissions/${params.revoke}?supportsAllDrives=true`, 'permission-revoke');

      // Contre-vérification : la permission ne doit plus exister (404 attendu).
      let confirmedGone = false;
      try {
        await gapi(sa.token, 'GET',
          `/files/${fileId}/permissions/${params.revoke}?supportsAllDrives=true`, 'revoke-verify');
      } catch (e) {
        if (e.httpStatus === 404) confirmedGone = true;
        else throw e;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, revoked: true, confirmedGone, fileId }) };
    }

    // ── Mode ouverture : préflight + permission anyone ──
    const file = await gapi(sa.token, 'GET',
      `/files/${fileId}?fields=id,name,size,mimeType,capabilities(canShare)&supportsAllDrives=true`, 'metadata');

    if (file.capabilities && file.capabilities.canShare === false) {
      return {
        statusCode: 403, headers,
        body: JSON.stringify({
          ok: false, step: 'preflight-canshare',
          error: 'Fichier non partageable par le compte de service (' + sa.saEmail + ')'
        })
      };
    }

    const perm = await gapi(sa.token, 'POST',
      `/files/${fileId}/permissions?supportsAllDrives=true`, 'permission-create',
      { type: 'anyone', role: 'reader' });

    const streamUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        permissionId: perm.id,
        streamUrl,
        file: { id: file.id, name: file.name, size: file.size || null, mimeType: file.mimeType },
        revokeHint: `Pour refermer : ?fileId=${fileId}&revoke=${perm.id}`,
        note: 'Le sweep de prod refermera automatiquement sous ~10 min — refermer manuellement dès la fin du test.'
      })
    };
  } catch (e) {
    const status = e.httpStatus === 404 ? 404 : (e.httpStatus === 403 ? 403 : 502);
    return {
      statusCode: status, headers,
      body: JSON.stringify({
        ok: false, step: e.step || 'inconnu', httpStatus: e.httpStatus || null,
        error: e.message, google: e.google || null
      })
    };
  }
};
