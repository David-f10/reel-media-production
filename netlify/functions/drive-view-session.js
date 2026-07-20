// netlify/functions/drive-view-session.js
// Session de visionnage client (review.html) : le serveur ouvre la permission
// "anyone" quand un client lance la lecture, l'entretient tant que la page envoie
// des heartbeats, et laisse le balayeur refermer (jamais de révocation directe ici —
// plusieurs spectateurs peuvent partager la même session).
//
// POST { action: 'open' | 'heartbeat' | 'close', sujetCode, fileId }
//   open      → portier A∪B (le fileId doit appartenir au sujet : Lien V1/V2/V3 ∪
//               base 📹 Versions) → openViewingPermission (réutilise la session
//               vivante si elle existe) → { ok, alive:true, reused, expiresAt }
//   heartbeat → lastSeen=now si la session est vivante et sous le cap ; sinon
//               { alive:false } (le client ré-ouvre). Aucune requête Notion.
//   close     → antidate lastSeen (best-effort, sendBeacon) ; NE révoque JAMAIS :
//               le heartbeat d'un autre spectateur peut re-vivifier, sinon le
//               balayeur referme (étape sweep ; en attendant, le sweep actuel
//               referme tout — sur-protection intérimaire assumée).
//
// FAIL-CLOSED : registre indisponible → aucune permission ouverte (throw en amont).
// Aucune URL loggée. Parse tolérant du body (sendBeacon peut envoyer en text/plain).

const { openViewingPermission, isViewAlive, VIEW_IDLE_TTL_MS, extractFileId } = require('./_drive');
const { getDriveOpenPermsStore } = require('./_blobs');
const { fileIdsDuSujet } = require('./drive-download-review');

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

  // Parse tolérant : sendBeacon peut poster en text/plain — on ignore le Content-Type.
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const action = String(body.action || '');
  const sujetCode = String(body.sujetCode || '').trim();
  const fileId = extractFileId(body.fileId || '');
  if (!action || !fileId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (action, fileId)' }) };
  }

  // ── heartbeat / close : légers, sans Notion — la session existante EST le droit ──
  if (action === 'heartbeat' || action === 'close') {
    let store;
    try { store = getDriveOpenPermsStore(); }
    catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ ok: false, step: 'registre', error: e.message }) }; }

    const now = Date.now();
    const entry = await store.get(fileId, { type: 'json' }).catch(() => null);

    if (action === 'heartbeat') {
      if (!isViewAlive(entry, now) || now >= (entry.expiresAt || 0)) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alive: false }) };
      }
      entry.lastSeen = now;
      await store.setJSON(fileId, entry).catch(() => {});
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, alive: true, expiresAt: entry.expiresAt }) };
    }

    // close : antidater lastSeen — la session expirera au prochain passage du balayeur,
    // sauf si un autre spectateur envoie un heartbeat entre-temps.
    if (entry && entry.type === 'view') {
      entry.lastSeen = now - VIEW_IDLE_TTL_MS - 1000;
      await store.setJSON(fileId, entry).catch(() => {});
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (action !== 'open') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };
  }

  // ── open : portier A∪B (jamais confiance au client) puis ouverture/réutilisation ──
  if (!sujetCode) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (sujetCode)' }) };
  }

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
    const result = await openViewingPermission(fileId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, alive: true, reused: result.reused, expiresAt: result.expiresAt })
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
