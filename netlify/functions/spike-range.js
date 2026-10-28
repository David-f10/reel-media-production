// netlify/functions/spike-range.js
// SPIKE JETABLE (hors chemin de prod) — UNE seule mesure : uc?export=download sert-il les requêtes par
// plage d'octets (Range) sur un fichier LÉGER ? C'est la mesure qui manquait : l'ancien spike mesurait le
// master de 438 Mo et ne lisait que la page HTML d'erreur (son rangeOk:false était un artefact). Ici on
// sonde un petit mp4 réel.
//
// NE CONCLUT RIEN : renvoie les en-têtes BRUTS de deux GET Range (début + milieu du fichier), à David d'en
// tirer la conclusion.
//
// Garde = PORTEUR DE LA CLÉ (verifyUser + peutGererAcces), car il ouvre une permission Drive {anyone,reader}
// transitoire — puis la RÉVOQUE TOUJOURS dans un finally (comme l'ancien spike-video.js et _drive.js).
// À retirer dès la mesure obtenue.
//
// Appel : POST { fileId } (en-têtes x-rm-id / x-rm-code).

const { verifyUser } = require('./_auth');
const { getSA, gapi, extractFileId } = require('./_drive');

const UC = 'https://drive.google.com/uc?export=download&id=';

// Un GET avec un en-tête Range. Lit tout le corps (le fichier est petit) pour reporter les octets réellement
// reçus. Renvoie les en-têtes bruts, AUCUNE interprétation.
async function sonderRange(id, range) {
  const r = await fetch(UC + encodeURIComponent(id), { headers: { Range: range }, redirect: 'follow' });
  let octetsRecus = null;
  try { const buf = await r.arrayBuffer(); octetsRecus = buf ? buf.byteLength : null; }
  catch (e) { /* corps non lisible → on garde null, on ne masque pas */ }
  return {
    rangeDemande: range,
    status: r.status,
    redirige: r.redirected === true,
    urlFinaleHote: (() => { try { return new URL(r.url).host; } catch (e) { return ''; } })(),
    contentRange: r.headers.get('content-range') || '',
    acceptRanges: r.headers.get('accept-ranges') || '',
    contentType: r.headers.get('content-type') || '',
    contentLength: r.headers.get('content-length') || '',
    octetsRecus: octetsRecus
  };
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  // Garde : porteur de la clé (ouverture d'une permission Drive transitoire).
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || auth.user.peutGererAcces !== true) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires d\'accès' }) };

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }
  if (!body.fileId) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Fournir { fileId }' }) };
  const id = extractFileId(body.fileId) || String(body.fileId);

  let sa;
  try { sa = await getSA(); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'auth-sa', error: e.message }) }; }

  let meta = null, permId = null;
  try {
    meta = await gapi(sa.token, 'GET', `/files/${id}?fields=id,name,size,mimeType&supportsAllDrives=true`, 'meta');
  } catch (e) {
    return { statusCode: e.httpStatus || 502, headers, body: JSON.stringify({ ok: false, step: 'meta', error: e.message, google: e.google || null }) };
  }

  let sondes = [];
  try {
    const perm = await gapi(sa.token, 'POST', `/files/${id}/permissions?supportsAllDrives=true`, 'perm', { type: 'anyone', role: 'reader' });
    permId = perm.id;
    // 1) début du fichier ; 2) milieu (pour écarter un 206 de façade qui renverrait toujours le début)
    sondes.push(await sonderRange(id, 'bytes=0-1048575'));
    sondes.push(await sonderRange(id, 'bytes=5000000-5999999'));
  } catch (e) {
    return { statusCode: e.httpStatus || 502, headers, body: JSON.stringify({ ok: false, step: e.step || 'sonde', error: e.message, google: e.google || null }) };
  } finally {
    // Révocation TOUJOURS (pas de balayeur pour ce spike jetable).
    if (permId) { try { await gapi(sa.token, 'DELETE', `/files/${id}/permissions/${permId}?supportsAllDrives=true`, 'revoke'); } catch (e) { console.error('spike-range revoke : ' + (e && e.message || '')); } }
  }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true,
      fichier: { id: meta.id, nom: meta.name, tailleOctets: meta.size ? +meta.size : null, mimeType: meta.mimeType },
      sondes: sondes // en-têtes bruts, aucune conclusion
    })
  };
};
