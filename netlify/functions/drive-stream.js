// netlify/functions/drive-stream.js
// RELAIS Range (étape 1 du lecteur) : navigateur <video> → cette fonction → Drive → retour. Le master reste
// PRIVÉ (aucune permission ouverte) ; le SA lit côté serveur et ne relaie que la TRANCHE demandée.
//
// Auth : cookie HttpOnly signé { fid, cid, exp } posé par drive-stream-open. Vérification LOCALE (signature +
// expiration), aucun appel Notion par tranche. Le relais ne sert QUE le fileId du cookie — jamais un fileId
// de la requête (une fuite de lien ne donne donc QUE ce fichier, ≤ durée du cookie).
//
// INERTE tant que client.html ne pointe pas un <video> dessus (étape 2). Rien d'existant n'est modifié.

const { getSA } = require('./_drive');
const { verifierValeur, lireCookie, construireRange, doitCompter } = require('./_streamcookie');
const { getStreamBudgetStore } = require('./_blobs');

const API = 'https://www.googleapis.com/drive/v3/files/';
const CAP = 4 * 1024 * 1024;            // 4 Mo/tranche → base64 ~5,3 Mo < plafond réponse Netlify (~6 Mo)
const BUDGET_STEP = 64 * 1024 * 1024;   // on compte une fois par palier de 64 Mo (coarse → n'affecte pas la fluidité)
const BUDGET_JOUR = 6 * 1024 * 1024 * 1024; // plafond quotidien PAR CONTACT (~6 Go) : borne un abus individuel
// Plafond MENSUEL GLOBAL du site, calé SOUS le quota réel de l'offre Netlify (David le règle ; 0 = désactivé).
// C'est lui qui protège la facture : un seul contact ne pouvait pas épuiser le site avec le seul plafond par
// contact. Atteint → 509, le lecteur bascule sur l'iframe Drive (repli), donc l'espace client reste lisible.
const SITE_CAP = (parseFloat(process.env.SITE_MONTHLY_CAP_GB || '0') > 0)
  ? Math.floor(parseFloat(process.env.SITE_MONTHLY_CAP_GB) * 1024 * 1024 * 1024) : 0;

function jour() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
function mois() { return new Date().toISOString().slice(0, 7).replace('-', ''); }

exports.handler = async (event) => {
  const base = { 'Cache-Control': 'private, no-store' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') return { statusCode: 405, headers: base, body: '' };

  const secret = process.env.STREAM_COOKIE_SECRET;
  if (!secret) return { statusCode: 503, headers: base, body: '' };

  const payload = verifierValeur(lireCookie(event.headers && (event.headers.cookie || event.headers.Cookie)), secret);
  if (!payload) return { statusCode: 403, headers: base, body: '' };
  const fileId = payload.fid;

  const { start, end } = construireRange(event.headers && (event.headers.range || event.headers.Range), CAP);

  // Garde-fou COARSE : une passe Blobs par palier de 64 Mo, pas par tranche (préserve la fluidité). Deux
  // compteurs : SITE (mensuel, global → protège la facture) et CONTACT (quotidien → borne un abus individuel).
  // FAIL-OPEN si Blobs indispo (mieux vaut une lecture qui marche qu'un plafond garanti ; cf. README).
  if (doitCompter(start, CAP, BUDGET_STEP)) {
    try {
      const store = getStreamBudgetStore();
      const kSite = 'site:' + mois(), kCid = 'cid:' + payload.cid + ':' + jour();
      const site = (await store.get(kSite, { type: 'json' }).catch(() => null)) || { octets: 0 };
      const cid = (await store.get(kCid, { type: 'json' }).catch(() => null)) || { octets: 0 };
      // Plafond SITE atteint → 509 : le lecteur basculera sur l'iframe Drive (repli), l'espace reste lisible.
      if (SITE_CAP > 0 && site.octets >= SITE_CAP) { console.error('drive-stream : plafond SITE atteint (' + mois() + ')'); return { statusCode: 509, headers: base, body: '' }; }
      // Plafond par contact → 429.
      if (cid.octets >= BUDGET_JOUR) return { statusCode: 429, headers: base, body: '' };
      // Alerte GRADUÉE (observabilité, une fois par palier franchi dans le mois). La notification proactive à
      // David passe par l'alerte d'usage native du dashboard Netlify (cf. README) — pas de service en plus.
      if (SITE_CAP > 0) {
        const pct = (site.octets + BUDGET_STEP) / SITE_CAP;
        if (pct >= 0.70) {
          const fk = 'site-alert:' + mois();
          const fl = (await store.get(fk, { type: 'json' }).catch(() => null)) || { niveau: 0 };
          const niveau = pct >= 0.90 ? 90 : 70;
          if (fl.niveau < niveau) { console.error('drive-stream ALERTE bande passante : ~' + Math.round(pct * 100) + '% du plafond site (' + mois() + ')'); await store.setJSON(fk, { niveau: niveau }).catch(() => {}); }
        }
      }
      await store.setJSON(kSite, { octets: site.octets + BUDGET_STEP }).catch(() => {});
      await store.setJSON(kCid, { octets: cid.octets + BUDGET_STEP }).catch(() => {});
    } catch (e) { /* Blobs indispo → fail-open */ }
  }

  let sa; try { sa = await getSA(); } catch (e) { return { statusCode: 500, headers: base, body: '' }; }

  let r;
  try {
    r = await fetch(API + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true', {
      headers: { Authorization: 'Bearer ' + sa.token, Range: 'bytes=' + start + '-' + end }
    });
  } catch (e) { return { statusCode: 502, headers: base, body: '' }; }
  if (r.status !== 206 && r.status !== 200) return { statusCode: 502, headers: base, body: '' };

  const buf = Buffer.from(await r.arrayBuffer());
  const contentRange = r.headers.get('content-range') || ('bytes ' + start + '-' + end + '/*');

  // En-têtes FABRIQUÉS (rien de Google relayé sauf les octets) : Accept-Ranges que Google omet (sans quoi
  // Safari croit le seek impossible), Content-Type explicite, Content-Range/Length cohérents. Cache privé
  // au navigateur (scrub arrière instantané dans la session) — jamais en cache partagé (master privé).
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Range': contentRange,
    'Content-Length': String(buf.length),
    'Cache-Control': 'private, max-age=3600'
  };
  if (event.httpMethod === 'HEAD') return { statusCode: 206, headers, body: '' };
  return { statusCode: 206, headers, body: buf.toString('base64'), isBase64Encoded: true };
};
