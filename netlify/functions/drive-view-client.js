// netlify/functions/drive-view-client.js
// Lot G tranche 2 — session de visionnage dans l'ESPACE CLIENT. Déclinaison de drive-view-session.js
// (lane review), servie par la SESSION du client (x-rmc-token) au lieu d'un jeton de review borné à un
// sujet. Elle partage la MÊME couche bas niveau — primitives de _drive.js et registre Blobs — sans la
// modifier ; seuls l'IDENTITÉ et le PORTIER changent.
//
// POST { action:'open'|'heartbeat'|'close', sujetCode, fileId }  + en-tête x-rmc-token (ou body.token au close)
//   open      → portier client (jeton de session + contact actif + sujet dans le périmètre de la marque)
//               PUIS condition 4 : le fileId doit être celui de la version COURANTE. Une version passée
//               → 403, JAMAIS une permission (décision de David : les passées ne se regardent pas).
//               → openViewingPermission (réutilise une session vivante) → { ok, alive, reused, expiresAt }
//   heartbeat → jeton de session valide (léger, aucun Notion) ; lastSeen=now si vivante, sinon { alive:false }.
//   close     → antidate lastSeen (best-effort). Jamais de révocation directe : le balayeur referme.
//
// DETTE ASSUMÉE (pas un manque) : le grant Drive « anyone with link » est GROSSIER — pendant la fenêtre
// de lecture, le fichier est lisible par quiconque détient le lien (jamais loggé, jamais donné hors
// périmètre, refermé par le balayeur à l'inactivité). C'est ACCEPTABLE AU VOLUME ACTUEL (quelques films
// par marque, une poignée de contacts) ; À REVOIR si la base client monte à des CENTAINES DE FICHIERS
// CONCURRENTS — alors il faudrait une permission par utilisateur Google ou un proxy de streaming, pas ce
// grant public. La décision « seule la version courante s'ouvre » (condition 4) borne déjà l'exposition à
// un fichier par sujet à la fois. Écrit ici pour que celui qui lira dans deux ans trouve la raison, pas un trou.
//
// FAIL-CLOSED : registre indisponible → aucune permission. Aucune URL loggée. Parse tolérant du body
// (sendBeacon du close peut poster en text/plain et ne pose aucun en-tête → le jeton voyage dans le corps).

const { openViewingPermission, isViewAlive, VIEW_IDLE_TTL_MS, extractFileId } = require('./_drive');
const { getDriveOpenPermsStore } = require('./_blobs');
const { verifier } = require('./_clienttoken');
const { autoriserMontage, fichierVideoAutorise } = require('./_montageclient');

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  // Parse tolérant : le close par sendBeacon peut poster en text/plain — on ignore le Content-Type.
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const action = String(body.action || '');
  const sujetCode = String(body.sujetCode || '').trim();
  const fileId = extractFileId(body.fileId || '');
  if (!action || !fileId) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (action, fileId)' }) };
  }

  // ── heartbeat / close : LÉGERS, aucun Notion — la session vivante EST le droit. On exige seulement un
  // jeton de session VALIDE (en-tête OU corps pour sendBeacon). Le portier complet (périmètre + versions)
  // ne tourne qu'à l'open : une permission n'existe dans le registre que parce qu'un open a passé le portier. ──
  if (action === 'heartbeat' || action === 'close') {
    const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || body.token || '';
    if (!verifier(jeton).ok) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
    }
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

    // close : antidater lastSeen — la session expirera au prochain passage du balayeur, sauf si un autre
    // spectateur envoie un heartbeat entre-temps. On NE révoque JAMAIS directement (session partagée).
    if (entry && entry.type === 'view') {
      entry.lastSeen = now - VIEW_IDLE_TTL_MS - 1000;
      await store.setJSON(fileId, entry).catch(() => {});
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (action !== 'open') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };
  }

  // ── open : portier client COMPLET (jamais confiance au navigateur) puis condition 4 ──
  if (!sujetCode) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants (sujetCode)' }) };
  }

  const az = await autoriserMontage(event, { sujetCode });
  if (!az.ok) {
    const msg = az.statut === 403 ? 'Accès refusé' : (az.statut === 401 ? 'Authentification requise' : 'Service temporairement indisponible');
    return { statusCode: az.statut, headers, body: JSON.stringify({ ok: false, error: msg }) };
  }

  // CONDITION 4 (non négociable) : SEUL le fileId de la version courante s'ouvre. Une version passée (ou
  // un fileId inconnu) → 403, et AUCUNE permission n'est ouverte. Fail-closed dans le portier.
  if (!fichierVideoAutorise(az, fileId)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, step: 'version', error: 'Seule la version en cours est visionnable' }) };
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
      body: JSON.stringify({ ok: false, step: e.step || 'inconnu', httpStatus: e.httpStatus || null, error: friendly, google: e.google || null })
    };
  }
};
