// netlify/functions/drive-stream-open.js
// MINT du cookie de flux (étape 1 du lecteur). Portier client COMPLET (autoriserMontage : session + contact
// actif + périmètre marque + version), résolution du RANG → fileId, puis pose un cookie HttpOnly signé
// { fid, cid, exp } limité au relais. N'OUVRE AUCUNE permission Drive (le master reste privé). Ne renvoie
// AUCUN fileId au navigateur : le <video> pointera sur /drive-stream sans paramètre, le cookie porte le fichier.
//
// INERTE tant que client.html ne l'appelle pas (étape 2). Rien d'existant n'est modifié.

const { verifier } = require('./_clienttoken');
const { autoriserMontage, fichierVideoAutorise } = require('./_montageclient');
const { signerValeur, construireSetCookie } = require('./_streamcookie');

const TTL_SEC = 2 * 60 * 60; // 2 h, court, plafond indépendant (voir note session dans la réponse)

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
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; headers['Access-Control-Allow-Credentials'] = 'true'; }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const secret = process.env.STREAM_COOKIE_SECRET;
  if (!secret) { console.error('drive-stream-open indispo : STREAM_COOKIE_SECRET manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }
  const sujetCode = String(body.sujetCode || '').trim();
  const rang = parseInt(body.rang, 10);
  if (!sujetCode || !Number.isInteger(rang) || rang < 1) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants' }) };

  // cid (garde-fou de consommation) : identifiant du contact, depuis le jeton de session. Local, pas de Notion.
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };

  // Portier complet + résolution rang → fileId (même ordre que drive-view-client).
  const az = await autoriserMontage(event, { sujetCode });
  if (!az.ok) {
    const msg = az.statut === 403 ? 'Accès refusé' : (az.statut === 401 ? 'Authentification requise' : 'Service temporairement indisponible');
    return { statusCode: az.statut, headers, body: JSON.stringify({ ok: false, error: msg }) };
  }
  if (rang > az.versions.length) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Version inconnue' }) };
  const fileId = az.versions[rang - 1].fileId;
  if (!fileId || !fichierVideoAutorise(az, fileId)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Cette version n\'est pas visionnable' }) };

  // Cookie signé : fichier autorisé + contact + expiration. HttpOnly, Secure, SameSite=Lax, Path=relais.
  const valeur = signerValeur({ fid: fileId, cid: vt.id, exp: Date.now() + TTL_SEC * 1000 }, secret);
  headers['Set-Cookie'] = construireSetCookie(valeur, TTL_SEC);

  // Aucun fileId renvoyé : le navigateur n'a pas besoin de le connaître (le cookie le porte).
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, expiresDansSec: TTL_SEC }) };
};
