// netlify/functions/spike-range-api.js
// SPIKE JETABLE (hors chemin de prod) — LE PIVOT de la voie « proxy Range → <video> natif » :
// l'API Drive files.get?alt=media honore-t-elle l'en-tête Range et renvoie-t-elle un 206 avec Content-Range ?
// Si oui, un proxy peut relayer des TRANCHES (le <video> ne télécharge jamais tout) → voie viable.
//
// Différence avec l'ancien spike (#204, supprimé) : celui-ci teste l'endpoint AUTHENTIFIÉ de l'API
// (Authorization: Bearer SA), PAS uc?export=download. Et il n'OUVRE AUCUNE permission, n'en révoque aucune :
// le SA a déjà accès au fichier (dossier partagé), on lit, point. Rien n'est écrit, rien n'est partagé.
//
// Deux plages distinctes (début + milieu) pour écarter un 206 de façade. Renvoie les en-têtes BRUTS, NE
// CONCLUT RIEN. Garde = porteur de la clé (verifyUser + peutGererAcces). À retirer dès la mesure obtenue.
//
// Appel : POST { fileId } (en-têtes x-rm-id / x-rm-code).

const { verifyUser } = require('./_auth');
const { getSA, extractFileId } = require('./_drive');

const API = 'https://www.googleapis.com/drive/v3/files/';

// Un GET sur alt=media avec un en-tête Range, authentifié SA. Lit le corps (petit : ~1 Mo) pour reporter les
// octets réellement reçus. Renvoie les en-têtes bruts, AUCUNE interprétation.
async function sonder(token, id, range) {
  const r = await fetch(API + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + token, Range: range }, redirect: 'follow'
  });
  let octetsRecus = null;
  try { const buf = await r.arrayBuffer(); octetsRecus = buf ? buf.byteLength : null; }
  catch (e) { /* corps non lisible → null, on ne masque pas */ }
  return {
    rangeDemande: range,
    status: r.status,                                   // 206 attendu si Range honoré ; 200 = Range ignoré
    redirige: r.redirected === true,
    contentRange: r.headers.get('content-range') || '', // ex. « bytes 5000000-5999999/458000000 »
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

  // Garde : porteur de la clé (même si ce spike n'ouvre aucune permission, il lit un master via le SA).
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

  // Métadonnées (taille) — pour choisir une plage « milieu » réelle. Lecture seule, aucune permission.
  let meta = null;
  try {
    const m = await fetch(API + encodeURIComponent(id) + '?fields=id,name,size,mimeType&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + sa.token } });
    if (!m.ok) return { statusCode: m.status, headers, body: JSON.stringify({ ok: false, step: 'meta', status: m.status }) };
    meta = await m.json();
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, step: 'meta', error: e.message }) }; }

  const taille = meta && meta.size ? parseInt(meta.size, 10) : 0;
  const milieu = taille > 3000000 ? Math.floor(taille / 2) : 1000000;

  let sondes;
  try {
    sondes = [
      await sonder(sa.token, id, 'bytes=0-1048575'),                         // début (moov si faststart)
      await sonder(sa.token, id, 'bytes=' + milieu + '-' + (milieu + 1048575)) // milieu (écarte un 206 de façade)
    ];
  } catch (e) { return { statusCode: 502, headers, body: JSON.stringify({ ok: false, step: 'sonde', error: e.message }) }; }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ok: true,
      fichier: { id: meta.id, nom: meta.name, tailleOctets: taille || null, mimeType: meta.mimeType },
      sondes: sondes // en-têtes bruts, aucune conclusion
    })
  };
};
