// netlify/functions/drive-stream.js
// RELAIS Range (étape 1 du lecteur) — fonction Netlify v2 STREAMING. navigateur <video> → cette fonction →
// Drive → retour. Le master reste PRIVÉ (aucune permission ouverte) ; le SA lit côté serveur et TUBE la
// tranche demandée vers le navigateur — PAS de base64, PAS de buffer-whole (le format base64 plafonnait à
// 4 Mo → saccade ; le spike #213 a prouvé le streaming sur l'offre). Tranches de 16 Mo (sous le plafond
// streaming 20 Mo).
//
// Auth : cookie HttpOnly signé { fid, cid, exp } posé par drive-stream-open. Vérification LOCALE (signature +
// expiration), aucun appel Notion par tranche. Le relais ne sert QUE le fileId du cookie — jamais un fileId
// de la requête (une fuite de lien ne donne donc QUE ce fichier, ≤ durée du cookie).
//
// INERTE tant que client.html ne pointe pas un <video> dessus (étape 2). Rien d'existant n'est modifié.
//
// Imports ESM depuis des modules CJS via l'interop default (proven par #213).

import drivePkg from './_drive.js';
import ckPkg from './_streamcookie.js';
import blobsPkg from './_blobs.js';
const { getSA } = drivePkg;
const { verifierValeur, lireCookie, construireRange, doitCompter } = ckPkg;
const { getStreamBudgetStore } = blobsPkg;

const API = 'https://www.googleapis.com/drive/v3/files/';
const CAP = 16 * 1024 * 1024;           // 16 Mo/tranche (sous le plafond streaming 20 Mo) → ~29 requêtes pour 459 Mo
const BUDGET_STEP = 64 * 1024 * 1024;   // on compte une fois par palier de 64 Mo (coarse → n'affecte pas la fluidité)
const BUDGET_JOUR = 6 * 1024 * 1024 * 1024; // plafond quotidien PAR CONTACT (~6 Go) : borne un abus individuel
// Plafond MENSUEL GLOBAL du site, calé SOUS le quota réel de l'offre Netlify (David le règle ; 0 = désactivé).
const SITE_CAP = (parseFloat(process.env.SITE_MONTHLY_CAP_GB || '0') > 0)
  ? Math.floor(parseFloat(process.env.SITE_MONTHLY_CAP_GB) * 1024 * 1024 * 1024) : 0;

function jour() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
function mois() { return new Date().toISOString().slice(0, 7).replace('-', ''); }
const NOSTORE = { 'cache-control': 'private, no-store' };

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('', { status: 405, headers: NOSTORE });

  const secret = process.env.STREAM_COOKIE_SECRET;
  if (!secret) return new Response('', { status: 503, headers: NOSTORE });

  const payload = verifierValeur(lireCookie(req.headers.get('cookie')), secret);
  if (!payload) return new Response('', { status: 403, headers: NOSTORE });
  const fileId = payload.fid;

  const { start, end } = construireRange(req.headers.get('range'), CAP);

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
      if (SITE_CAP > 0 && site.octets >= SITE_CAP) { console.error('drive-stream : plafond SITE atteint (' + mois() + ')'); return new Response('', { status: 509, headers: NOSTORE }); }
      // Plafond par contact → 429.
      if (cid.octets >= BUDGET_JOUR) return new Response('', { status: 429, headers: NOSTORE });
      // Alerte GRADUÉE (une fois par palier franchi). Notification proactive = alerte d'usage du dashboard
      // Netlify (cf. README) — pas de service en plus.
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

  let sa; try { sa = await getSA(); } catch (e) { return new Response('', { status: 500, headers: NOSTORE }); }

  let r;
  try {
    r = await fetch(API + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true', {
      headers: { Authorization: 'Bearer ' + sa.token, Range: 'bytes=' + start + '-' + end }
    });
  } catch (e) { return new Response('', { status: 502, headers: NOSTORE }); }
  if (r.status !== 206 && r.status !== 200) return new Response('', { status: 502, headers: NOSTORE });

  // En-têtes FABRIQUÉS (rien de Google relayé sauf les octets) : Accept-Ranges (Google l'omet → sans ça Safari
  // croit le seek impossible), Content-Type explicite, Content-Range/Length de Drive (cohérents avec la tranche).
  // Cache privé navigateur (scrub arrière instantané dans la session), jamais partagé (master privé).
  const headers = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'content-range': r.headers.get('content-range') || ('bytes ' + start + '-' + end + '/*'),
    'cache-control': 'private, max-age=3600'
  };
  const cl = r.headers.get('content-length'); if (cl) headers['content-length'] = cl;

  if (req.method === 'HEAD') return new Response(null, { status: 206, headers });
  // On TUBE le corps de Drive directement (ReadableStream), sans base64 ni buffer-whole.
  return new Response(r.body, { status: 206, headers });
};
