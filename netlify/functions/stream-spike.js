// netlify/functions/stream-spike.js
// PREUVE DE BOUT EN BOUT, JETABLE — valide la chaîne navigateur → fonction Netlify → Drive → retour pour un
// <video> natif alimenté par un proxy Range. À SUPPRIMER dès les mesures prises. Ne touche à rien d'autre.
//
// PROTECTION (touche un master, donc sécurisé le temps du test) :
//   • la fonction ne lit QUE le fichier de l'env SPIKE_FILE_ID — JAMAIS un fileId venu de la requête : même si
//     tout fuite, elle ne sert que ce fichier de test choisi par David, jamais un master arbitraire ;
//   • la page de test est gardée par SPIKE_SECRET (David ouvre ?p=<SECRET> une fois) ;
//   • le flux est gardé par un JETON HMAC court (2 h), fabriqué dans la page ; l'URL du <video> ne porte que ce
//     jeton — ni le secret, ni le fileId. Un lien fuité = ce seul fichier de test, ≤ 2 h.
//   • jetable : supprimer la fonction + retirer les deux env après le test.
//
// En-têtes FABRIQUÉS (on ne relaie RIEN de Google sauf les octets) : Accept-Ranges (Google l'omet),
// Content-Type explicite, Content-Range/Content-Length cohérents, no-store. Pas de content-disposition de
// Google (qui ferait croire à un téléchargement), pas de x-goog-*.

const crypto = require('crypto');
const { getSA } = require('./_drive');

const API = 'https://www.googleapis.com/drive/v3/files/';
const CAP = 2 * 1024 * 1024; // 2 Mo par réponse — sous le plafond de réponse Netlify (~6 Mo) ; le <video> re-demande la suite

function sign(exp, secret) { return crypto.createHmac('sha256', secret).update(String(exp)).digest('hex'); }
function jetonOk(k, secret) {
  const s = String(k || ''); const i = s.indexOf('.'); if (i < 0) return false;
  const exp = parseInt(s.slice(0, i), 10); const sig = s.slice(i + 1);
  if (!exp || Date.now() > exp) return false;
  const bon = sign(exp, secret);
  try { return sig.length === bon.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(bon)); } catch (e) { return false; }
}

exports.handler = async (event) => {
  const SECRET = process.env.SPIKE_SECRET || '';
  const FILE = process.env.SPIKE_FILE_ID || '';
  if (!SECRET || !FILE) return { statusCode: 503, headers: { 'Cache-Control': 'no-store' }, body: 'SPIKE_SECRET / SPIKE_FILE_ID manquants' };
  const q = event.queryStringParameters || {};

  // ── 1) Page de test (gardée par le secret) : David ouvre ?p=<SECRET> sur Mac et iPhone ──
  if (q.p != null) {
    if (q.p !== SECRET) return { statusCode: 403, headers: { 'Cache-Control': 'no-store' }, body: 'non' };
    const exp = Date.now() + 2 * 60 * 60 * 1000; // 2 h
    const k = exp + '.' + sign(exp, SECRET);
    const src = '/.netlify/functions/stream-spike?k=' + encodeURIComponent(k);
    const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Preuve proxy</title><body style="margin:0;background:#111;color:#eee;font:14px system-ui;text-align:center">' +
      '<video id="v" controls playsinline preload="auto" style="width:100%;max-width:480px;display:block;margin:0 auto;background:#000" src="' + src + '"></video>' +
      '<div style="padding:12px">position : <b id="t">0:00</b> &middot; <span id="st">—</span></div>' +
      '<script>' +
      'var v=document.getElementById("v"),t=document.getElementById("t"),s=document.getElementById("st");' +
      'function f(x){x=Math.max(0,x|0);return (x/60|0)+":"+("0"+(x%60)).slice(-2);}' +
      'v.addEventListener("timeupdate",function(){t.textContent=f(v.currentTime);});' +
      'v.addEventListener("seeking",function(){s.textContent="chargement…";});' +
      'v.addEventListener("seeked",function(){s.textContent="prêt";});' +
      'v.addEventListener("playing",function(){s.textContent="lecture";});' +
      'v.addEventListener("pause",function(){s.textContent="pause "+f(v.currentTime);});' +
      'v.addEventListener("error",function(){s.textContent="ERREUR lecteur";});' +
      '</script>';
    return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, body: html };
  }

  // ── 2) Flux : jeton court obligatoire ; lit UNIQUEMENT le fichier d'env ──
  if (!jetonOk(q.k, SECRET)) return { statusCode: 403, headers: { 'Cache-Control': 'no-store' }, body: 'non' };

  let sa; try { sa = await getSA(); } catch (e) { return { statusCode: 500, headers: { 'Cache-Control': 'no-store' }, body: 'sa' }; }

  // Plage demandée par le <video>, CAPÉE à 2 Mo.
  const rg = (event.headers && (event.headers['range'] || event.headers['Range'])) || '';
  const m = /bytes=(\d+)-(\d*)/.exec(rg);
  const start = m ? parseInt(m[1], 10) : 0;
  const demEnd = (m && m[2]) ? parseInt(m[2], 10) : (start + CAP - 1);
  const end = Math.min(demEnd, start + CAP - 1);

  let r;
  try {
    r = await fetch(API + encodeURIComponent(FILE) + '?alt=media&supportsAllDrives=true', {
      headers: { Authorization: 'Bearer ' + sa.token, Range: 'bytes=' + start + '-' + end }
    });
  } catch (e) { return { statusCode: 502, headers: { 'Cache-Control': 'no-store' }, body: 'drive fetch' }; }
  if (r.status !== 206 && r.status !== 200) return { statusCode: 502, headers: { 'Cache-Control': 'no-store' }, body: 'drive ' + r.status };

  const buf = Buffer.from(await r.arrayBuffer());
  const cr = r.headers.get('content-range') || ('bytes ' + start + '-' + end + '/*'); // Drive donne la taille totale

  return {
    statusCode: 206,
    headers: {
      'Content-Type': 'video/mp4',      // explicite (iOS strict)
      'Accept-Ranges': 'bytes',         // FABRIQUÉ : Google ne l'annonce pas → sans ça, Safari croit le seek impossible
      'Content-Range': cr,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, no-store'
    },
    body: buf.toString('base64'),
    isBase64Encoded: true
  };
};
