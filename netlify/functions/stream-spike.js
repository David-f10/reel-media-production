// netlify/functions/stream-spike.js
// PREUVE DE BOUT EN BOUT, JETABLE — version STREAMING (fonction Netlify v2). Objet du test : le streaming
// est-il disponible sur l'offre, et la lecture devient-elle fluide ? On TUBE les octets de Drive directement
// vers le navigateur — PAS de base64, PAS de buffer-whole — par tranches de ~16 Mo (sous le plafond streaming
// de 20 Mo). À comparer, même URL, avec la version base64 (4 Mo) qui saccadait. À SUPPRIMER après mesures.
//
// Format v2 (export default + Response) : le streaming est natif (le corps de la réponse est un flux), aucun
// package en plus. On importe getSA du module _drive (CJS) via l'interop ESM.
//
// Protection inchangée : ne sert QUE le fichier de l'env SPIKE_FILE_ID (jamais un id de requête) ; page gardée
// par SPIKE_SECRET ; flux gardé par un jeton HMAC court dans l'URL (c'est un terrain de test, pas la prod).

import crypto from 'node:crypto';
import drivePkg from './_drive.js';
const { getSA } = drivePkg;

const API = 'https://www.googleapis.com/drive/v3/files/';
const CAP = 16 * 1024 * 1024; // 16 Mo : sous le plafond streaming (20 Mo), ~29 requêtes pour 459 Mo (vs ~115 à 4 Mo)

function sign(exp, secret) { return crypto.createHmac('sha256', secret).update(String(exp)).digest('hex'); }
function jetonOk(k, secret) {
  const s = String(k || ''); const i = s.indexOf('.'); if (i < 0) return false;
  const exp = parseInt(s.slice(0, i), 10); const sig = s.slice(i + 1);
  if (!exp || Date.now() > exp) return false;
  const bon = sign(exp, secret);
  try { return sig.length === bon.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(bon)); } catch (e) { return false; }
}

export default async (req) => {
  const SECRET = process.env.SPIKE_SECRET || '';
  const FILE = process.env.SPIKE_FILE_ID || '';
  if (!SECRET || !FILE) return new Response('SPIKE_SECRET / SPIKE_FILE_ID manquants', { status: 503 });
  const q = new URL(req.url).searchParams;

  // ── Page de test (gardée par le secret) : David ouvre ?p=<SECRET> sur Mac et iPhone ──
  if (q.has('p')) {
    if (q.get('p') !== SECRET) return new Response('non', { status: 403 });
    const exp = Date.now() + 2 * 60 * 60 * 1000; // 2 h
    const k = exp + '.' + sign(exp, SECRET);
    const src = '/.netlify/functions/stream-spike?k=' + encodeURIComponent(k);
    const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Preuve proxy (streaming)</title><body style="margin:0;background:#111;color:#eee;font:14px system-ui;text-align:center">' +
      '<video id="v" controls playsinline preload="auto" style="width:100%;max-width:480px;display:block;margin:0 auto;background:#000" src="' + src + '"></video>' +
      '<div style="padding:12px">position : <b id="t">0:00</b> &middot; <span id="s">—</span> &middot; tranches de 16 Mo (streaming)</div>' +
      '<script>' +
      'var v=document.getElementById("v"),t=document.getElementById("t"),s=document.getElementById("s");' +
      'function f(x){x=Math.max(0,x|0);return (x/60|0)+":"+("0"+(x%60)).slice(-2);}' +
      'v.addEventListener("timeupdate",function(){t.textContent=f(v.currentTime);});' +
      'v.addEventListener("waiting",function(){s.textContent="⏳ mise en mémoire…";});' +
      'v.addEventListener("playing",function(){s.textContent="▶ lecture";});' +
      'v.addEventListener("seeking",function(){s.textContent="chargement…";});' +
      'v.addEventListener("seeked",function(){s.textContent="prêt";});' +
      'v.addEventListener("pause",function(){s.textContent="pause "+f(v.currentTime);});' +
      'v.addEventListener("error",function(){s.textContent="ERREUR lecteur";});' +
      '</script>';
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  // ── Flux : jeton court obligatoire ; lit UNIQUEMENT le fichier d'env ──
  if (!jetonOk(q.get('k'), SECRET)) return new Response('non', { status: 403 });

  let sa; try { sa = await getSA(); } catch (e) { return new Response('sa', { status: 500 }); }

  // Plage demandée par le <video>, CAPÉE à 16 Mo.
  const rg = req.headers.get('range') || '';
  const m = /bytes=(\d+)-(\d*)/.exec(rg);
  const start = m ? parseInt(m[1], 10) : 0;
  const demEnd = (m && m[2]) ? parseInt(m[2], 10) : (start + CAP - 1);
  const end = Math.min(demEnd, start + CAP - 1);

  let r;
  try {
    r = await fetch(API + encodeURIComponent(FILE) + '?alt=media&supportsAllDrives=true', {
      headers: { Authorization: 'Bearer ' + sa.token, Range: 'bytes=' + start + '-' + end }
    });
  } catch (e) { return new Response('drive fetch', { status: 502 }); }
  if (r.status !== 206 && r.status !== 200) return new Response('drive ' + r.status, { status: 502 });

  // On TUBE le corps de Drive (ReadableStream) directement : aucun base64, aucun buffer-whole. En-têtes
  // FABRIQUÉS : Accept-Ranges (Google l'omet), Content-Type, Content-Range/Length cohérents, cache privé.
  const headers = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'content-range': r.headers.get('content-range') || ('bytes ' + start + '-' + end + '/*'),
    'cache-control': 'private, max-age=3600'
  };
  const cl = r.headers.get('content-length'); if (cl) headers['content-length'] = cl;
  return new Response(r.body, { status: 206, headers });
};
