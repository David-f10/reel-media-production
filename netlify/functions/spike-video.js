// netlify/functions/spike-video.js
// SPIKE JETABLE (lecture, hors chemin de prod) — répond, chiffres à l'appui, aux questions qui décident si
// on peut POSSÉDER le lecteur (<video> natif) pour remplir « Moment » à la position courante :
//   1. uc?export=download sert-il le master, ou l'interstitiel antivirus (> ~100 Mo) ?
//   2. supporte-t-il les requêtes par plage d'octets (Range) ? (sinon pas de déplacement utilisable)
//   3. distribution des tailles du parc (438 Mo = pire cas ou moyenne ?)
// Le mobile reste derrière (seul un proxy y répondra) et Safari/iOS se teste sur un vrai téléphone, pas ici.
//
// À retirer une fois la décision prise. Garde = PORTEUR DE LA CLÉ (il ouvre une permission Drive transitoire,
// comme le visionnage, puis la révoque TOUJOURS). Rien d'autre n'est écrit.
//
// Appels :
//   { fileId }            → teste UN fichier : métadonnées (taille, durée) + sonde uc (interstitiel ? Range ?)
//   { parc:true, limit?, offset? } → balaie les tailles des montages de 📹 Versions (files.get fields=size)

const { verifyUser } = require('./_auth');
const { getSA, gapi, extractFileId } = require('./_drive');

const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const UC = 'https://drive.google.com/uc?export=download&id=';

// PUR et testable : interprète la réponse de uc. interstitiel = HTML (Google n'a pas pu scanner le gros
// fichier). rangeOk = 206, ou en-tête accept-ranges:bytes, ou content-range présent.
function interpreterUc(status, contentType, acceptRanges, contentRange) {
  const interstitiel = /text\/html/i.test(contentType || '');
  const rangeOk = status === 206 || /bytes/i.test(acceptRanges || '') || !!contentRange;
  return { interstitiel, rangeOk };
}

async function sonderUc(fileId) {
  const r = await fetch(UC + encodeURIComponent(fileId), { headers: { Range: 'bytes=0-1048575' } }); // 1er Mo seulement
  const contentType = r.headers.get('content-type') || '';
  const acceptRanges = r.headers.get('accept-ranges') || '';
  const contentRange = r.headers.get('content-range') || '';
  const contentLength = r.headers.get('content-length') || '';
  const { interstitiel, rangeOk } = interpreterUc(r.status, contentType, acceptRanges, contentRange);
  // On NE télécharge PAS le fichier : on lit un seul morceau puis on annule le flux (évite 438 Mo).
  let apercu = '';
  try {
    const reader = r.body.getReader();
    const { value } = await reader.read();
    if (value && interstitiel) apercu = Buffer.from(value).toString('utf8').replace(/\s+/g, ' ').slice(0, 240);
    await reader.cancel();
  } catch (e) { /* flux non lisible → ignoré */ }
  return { status: r.status, contentType, acceptRanges, contentRange, contentLength, interstitiel, rangeOk, apercu };
}

async function queryVersions(token) {
  const out = [];
  let cursor = null, pages = 0;
  do {
    const b = { page_size: 100 }; if (cursor) b.start_cursor = cursor;
    const r = await fetch('https://api.notion.com/v1/databases/' + DB_VERSIONS + '/query', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify(b)
    });
    if (!r.ok) throw new Error('query versions ' + r.status);
    const d = await r.json(); out.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null; pages++;
  } while (cursor && pages < 40);
  return out;
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'NOTION_TOKEN manquant' }) };

  // Garde : porteur de la clé (le spike ouvre une permission Drive transitoire).
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || auth.user.peutGererAcces !== true) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires d\'accès' }) };

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  let sa;
  try { sa = await getSA(); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'auth-sa', error: e.message }) }; }

  try {
    // ── UN fichier : métadonnées + sonde uc (interstitiel ? Range ?) ──
    if (body.fileId) {
      const id = extractFileId(body.fileId) || String(body.fileId);
      const meta = await gapi(sa.token, 'GET', `/files/${id}?fields=id,name,size,mimeType,videoMediaMetadata&supportsAllDrives=true`, 'meta');
      let uc = null, permId = null;
      try {
        const perm = await gapi(sa.token, 'POST', `/files/${id}/permissions?supportsAllDrives=true`, 'perm', { type: 'anyone', role: 'reader' });
        permId = perm.id;
        uc = await sonderUc(id);
      } finally {
        if (permId) { try { await gapi(sa.token, 'DELETE', `/files/${id}/permissions/${permId}?supportsAllDrives=true`, 'revoke'); } catch (e) { /* le balayeur n'existe pas pour ce spike : on log */ console.error('spike-video revoke : ' + (e && e.message || '')); } }
      }
      const tailleMo = meta.size ? Math.round(+meta.size / 1048576) : null;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, fichier: { id: meta.id, nom: meta.name, tailleOctets: meta.size ? +meta.size : null, tailleMo, mimeType: meta.mimeType, dureeMs: meta.videoMediaMetadata && meta.videoMediaMetadata.durationMillis || null, largeur: meta.videoMediaMetadata && meta.videoMediaMetadata.width || null, hauteur: meta.videoMediaMetadata && meta.videoMediaMetadata.height || null }, uc } ) };
    }

    // ── Parc : distribution des tailles des montages ──
    if (body.parc) {
      const limit = Math.min(Math.max(parseInt(body.limit, 10) || 25, 1), 60);
      const offset = Math.max(parseInt(body.offset, 10) || 0, 0);
      const versions = await queryVersions(notionToken);
      const ids = [];
      const vus = new Set();
      for (const v of versions) {
        const titre = ((v.properties && v.properties.Titre && v.properties.Titre.title) || []).map(t => t.plain_text || '').join('');
        const fid = extractFileId(titre);
        if (fid && !vus.has(fid)) { vus.add(fid); ids.push(fid); }
      }
      const totalMontages = ids.length;
      const lot = ids.slice(offset, offset + limit);
      const tailles = [];
      for (const fid of lot) {
        try { const m = await gapi(sa.token, 'GET', `/files/${fid}?fields=size&supportsAllDrives=true`, 'size'); if (m && m.size) tailles.push(+m.size); }
        catch (e) { /* fichier inaccessible au SA → ignoré du calcul */ }
      }
      tailles.sort((a, b) => a - b);
      const mo = (o) => Math.round(o / 1048576);
      const mediane = tailles.length ? tailles[Math.floor(tailles.length / 2)] : null;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, parc: { totalMontagesAvecLien: totalMontages, echantillon: { offset, demandes: lot.length, mesures: tailles.length }, tailleMinMo: tailles.length ? mo(tailles[0]) : null, tailleMedianeMo: mediane ? mo(mediane) : null, tailleMaxMo: tailles.length ? mo(tailles[tailles.length - 1]) : null, auDessusDe100Mo: tailles.filter(t => t > 100 * 1048576).length, note: offset + limit < totalMontages ? 'échantillon partiel — relance avec offset=' + (offset + limit) : 'parc couvert' } } ) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Fournir { fileId } ou { parc:true }' }) };
  } catch (e) {
    return { statusCode: e.httpStatus || 502, headers, body: JSON.stringify({ ok: false, step: e.step || 'inconnu', error: e.message, google: e.google || null }) };
  }
};

module.exports._test = { interpreterUc };
