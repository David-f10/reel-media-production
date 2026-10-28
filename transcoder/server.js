// transcoder/server.js — WORKER de transcodage (Cloud Run). INERTE tant que personne ne l'appelle : il ne
// touche à AUCUN fichier de l'app ni à la voie client. Tranche 1 seulement (pas de branchement à l'envoi,
// pas de cron — ça, c'est tranche 2).
//
// POST /transcode  { masterFileId, versionId }   en-tête x-transcoder-secret: <secret>
//   1. idempotence : si le proxy existe déjà dans le bucket (clé = version + fileId) → URL signée, on sort.
//   2. télécharge le master depuis Drive (SA de l'app, scope lecture seule).
//   3. ffprobe (durée + codec audio — on ne SUPPOSE pas l'AAC, on le lit).
//   4. ffmpeg : petit côté calé (défaut 1080), ~2,5 Mbit/s (calculable depuis la durée), h264/yuv420p/
//      +faststart, audio copié si déjà AAC sinon AAC. UN seul rendu.
//   5. dépose dans le bucket (privé) + URL signée V4 expirante. Nettoie les temporaires.
//
// Secrets : UNIQUEMENT par variables d'environnement, jamais en dur. Voir README.
//
// GET /health → 200 (sonde Cloud Run).

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');
const lib = require('./lib');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const SECRET = process.env.TRANSCODER_SHARED_SECRET || '';
const BUCKET = process.env.PROXY_BUCKET || '';
const SHORT_EDGE = process.env.PROXY_SHORT_EDGE || '1080';
const VIDEO_KBPS = process.env.PROXY_VIDEO_KBPS || '2500';
const TARGET_MB = process.env.PROXY_TARGET_MB || '';        // facultatif : cap de poids → débit calculé depuis la durée
const PRESET = process.env.PROXY_PRESET || 'slow';
const AAC_KBPS = process.env.PROXY_AAC_KBPS || '128';
const TTL_SEC = parseInt(process.env.PROXY_SIGNED_URL_TTL_SEC, 10) || 3600;

// ── Petits utilitaires ──
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function lireCorps(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve(null); } }); req.on('error', () => resolve(null)); });
}
function secretOk(fourni) {
  if (!SECRET || !fourni) return false;
  const a = Buffer.from(String(fourni)), b = Buffer.from(SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(cmd + ' a échoué (' + code + ') : ' + err.slice(-500))));
  });
}

// Drive : client lecture seule à partir du JSON du compte de service de l'app (même SA qui a déjà accès au
// dossier des vidéos → AUCUN nouveau partage Drive). Scope minimal : drive.readonly.
function driveClient() {
  const raw = process.env.DRIVE_SA_JSON;
  if (!raw) throw new Error('DRIVE_SA_JSON manquant');
  const creds = JSON.parse(raw);
  const jwt = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  return google.drive({ version: 'v3', auth: jwt });
}
async function telechargerMaster(drive, fileId, dest) {
  const r = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(dest);
    r.data.on('error', reject); w.on('error', reject); w.on('finish', resolve);
    r.data.pipe(w);
  });
}

async function transcoder(body) {
  const masterFileId = String(body.masterFileId || '').trim();
  const versionId = String(body.versionId || '').trim();
  if (!masterFileId || !versionId) { const e = new Error('masterFileId et versionId requis'); e.code = 400; throw e; }
  if (!BUCKET) { const e = new Error('PROXY_BUCKET manquant'); e.code = 500; throw e; }

  const objet = lib.cleObjet(versionId, masterFileId);
  const storage = new Storage(); // ADC = identité de service Cloud Run
  const file = storage.bucket(BUCKET).file(objet);

  const signer = async () => {
    const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + TTL_SEC * 1000 });
    return url;
  };

  // 1) Idempotence : proxy déjà là → on ne ré-encode pas, on signe et on sort.
  const [existe] = await file.exists();
  if (existe) return { ok: true, reutilise: true, objet, signedUrl: await signer(), expiresDansSec: TTL_SEC };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rmp-'));
  const src = path.join(tmp, 'master'); // extension inutile pour ffmpeg
  const out = path.join(tmp, 'proxy.mp4');
  try {
    // 2) master depuis Drive
    await telechargerMaster(driveClient(), masterFileId, src);

    // 3) ffprobe : durée + codec audio (lus, pas supposés)
    const probe = lib.lireFfprobe(JSON.parse(await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', src])));
    if (!probe.aUneVideo) { const e = new Error('le master ne contient pas de piste vidéo'); e.code = 422; throw e; }

    // 4) débit (défaut validé, éventuellement capé par la durée) + audio
    const videoKbps = lib.debitVideoKbps({ dureeSec: probe.dureeSec, defautKbps: VIDEO_KBPS, capMo: TARGET_MB, audioKbps: AAC_KBPS });
    const audioArgs = lib.argsAudio(probe.codecAudio, AAC_KBPS);
    await run('ffmpeg', lib.construireArgsFfmpeg({ entree: src, sortie: out, shortEdge: SHORT_EDGE, videoKbps, preset: PRESET, audioArgs }));

    // 5) dépôt bucket (privé) + URL signée
    await storage.bucket(BUCKET).upload(out, { destination: objet, resumable: false, metadata: { contentType: 'video/mp4', cacheControl: 'private, max-age=0' } });
    const tailleProxy = fs.statSync(out).size;
    return { ok: true, reutilise: false, objet, signedUrl: await signer(), expiresDansSec: TTL_SEC, dureeMs: probe.dureeMs, debitKbps: videoKbps, codecAudio: probe.codecAudio || null, tailleProxyOctets: tailleProxy };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

const serveur = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/transcode') return json(res, 404, { ok: false, error: 'not found' });
  if (!SECRET) return json(res, 503, { ok: false, error: 'TRANSCODER_SHARED_SECRET manquant' });
  if (!secretOk(req.headers['x-transcoder-secret'])) return json(res, 403, { ok: false, error: 'secret invalide' });

  const body = await lireCorps(req);
  if (!body) return json(res, 400, { ok: false, error: 'JSON invalide' });
  try {
    const r = await transcoder(body);
    json(res, 200, r);
  } catch (e) {
    console.error('transcode échec : ' + (e && e.message || ''));
    json(res, e && e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { ok: false, error: (e && e.message) || 'échec' });
  }
});

serveur.listen(PORT, () => console.log('transcoder à l\'écoute sur ' + PORT));
