// netlify/functions/sonde-transcodage.js
// ⛔ OUTIL DE DIAGNOSTIC TEMPORAIRE — À SUPPRIMER APRÈS USAGE. Ce n'est PAS une fonctionnalité.
// But : une requête pour savoir si Google Drive sert un rendu TRANSCODÉ (plus léger) d'une vidéo DÉPOSÉE, qu'on
// pourrait relayer au lieu des octets d'origine (lot « saccades », Partie 2). GET → mini-formulaire (aucun accès
// Drive). POST (id + code équipe + fileId) → vérif + 3 GET Drive en lecture seule.
//
// GARDE : verifyUser (_auth, le portier des routes admin) ENVELOPPÉ du MÊME compteur que la connexion équipe
// (login.js : verifierThrottle/enregistrerEchec/enregistrerSucces, POLICE_EQUIPE, clé (ip, id)). ⚠ verifyUser NE
// compte PAS lui-même : sans ce throttle, cette porte serait un guichet de devinette de codes NON ralenti — plus
// faible que l'entrée normale. On passe donc par le compteur, et le banc le prouve.
//
// ⛔ Le code n'apparaît QUE dans la validation : jamais en log, en réponse, en redirection, en URL, en cookie, en
// stockage navigateur (formulaire autocomplete="off"). Aucun cookie posé, aucune session créée.
// ⛔ Exactement 3 GET Drive, aucune écriture Drive, aucun appel Notion (hors verifyUser), aucun partage ouvert.
// RETRAIT : supprimer ce fichier + tests/sonde-transcodage-bench.js + sa ligne dans package.json + tools/sonde-drive-transcodage.js.

const { verifyUser } = require('./_auth');
const { verifierThrottle, enregistrerEchec, enregistrerSucces, POLICE_EQUIPE } = require('./_throttle');
const drivePkg = require('./_drive');
const getSA = drivePkg.getSA || (drivePkg.default && drivePkg.default.getSA);

const API = 'https://www.googleapis.com/drive/v3/files/';
const Mo = (n) => (typeof n === 'number' && isFinite(n)) ? (n / (1024 * 1024)).toFixed(1) + ' Mo' : 'inconnue';
function clientIp(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || '').trim() || String(h['x-forwarded-for'] || '').split(',')[0].trim() || '';
}
const tailleEntete = (r) => {
  const cr = r.headers && r.headers.get && r.headers.get('content-range');
  if (cr && cr.indexOf('/') !== -1) { const n = parseInt(cr.split('/').pop(), 10); if (isFinite(n)) return n; }
  const cl = r.headers && r.headers.get && r.headers.get('content-length');
  return cl ? parseInt(cl, 10) : null;
};

const FORMULAIRE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Diagnostic transcodage</title>' +
  '<style>body{font:15px/1.5 system-ui,-apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1a1a1a}' +
  '.avert{background:#fff4e5;border:1px solid #f0c060;border-radius:8px;padding:12px 14px;margin:0 0 22px;font-size:14px}' +
  'label{display:block;margin:14px 0 4px;font-size:13px;color:#444}input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #ccc;border-radius:6px;font:inherit}' +
  'button{margin-top:20px;padding:10px 20px;border:0;border-radius:6px;background:#1a1a1a;color:#fff;font:inherit;cursor:pointer}</style>' +
  '<div class="avert"><b>Outil de diagnostic temporaire — Réel Média.</b> Ce n\'est pas la page de connexion de l\'app.</div>' +
  '<form method="post" autocomplete="off">' +
  '<label>Identifiant d\'équipe</label><input name="id" autocomplete="off" autocapitalize="off" spellcheck="false">' +
  '<label>Code d\'accès</label><input name="code" type="password" autocomplete="off">' +
  '<label>Identifiant du fichier Drive (un seul)</label><input name="fileId" autocomplete="off" autocapitalize="off" spellcheck="false">' +
  '<button type="submit">Sonder</button></form>';

exports.handler = async (event) => {
  const base = { 'Cache-Control': 'no-store' };
  const texte = (s) => ({ statusCode: 200, headers: { ...base, 'Content-Type': 'text/plain; charset=utf-8' }, body: s });
  const refus = (code, s) => ({ statusCode: code, headers: { ...base, 'Content-Type': 'text/plain; charset=utf-8' }, body: s });

  // ⛔ GET ne touche PAS Drive : il ne sert que le formulaire vide.
  if (event.httpMethod === 'GET') return { statusCode: 200, headers: { ...base, 'Content-Type': 'text/html; charset=utf-8' }, body: FORMULAIRE };
  if (event.httpMethod !== 'POST') return refus(405, 'Method not allowed');

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { b = Object.fromEntries(new URLSearchParams(event.body || '')); }
  const id = String(b.id || '').trim();
  const code = String(b.code || '').trim();
  const fileId = String(b.fileId || '').trim();

  // Throttle AVANT la vérif (patron login.js) : un guichet de devinette hérite du MÊME ralentissement.
  const ip = clientIp(event);
  const t = await verifierThrottle(ip, id, POLICE_EQUIPE);
  if (t.bloque) return refus(429, 'Trop de tentatives, réessayez dans un instant.');
  const auth = await verifyUser({ id, code }); // ⛔ le code ne sert qu'ici
  if (!auth.ok) { await enregistrerEchec(ip, id, POLICE_EQUIPE); return refus(403, 'Accès refusé.'); }
  await enregistrerSucces(ip, id, POLICE_EQUIPE);

  if (!fileId) return texte('Indiquez un identifiant de fichier.');

  let token; try { const sa = await getSA(); token = sa && sa.token; } catch (e) { return texte('Service indisponible (compte de service).'); }
  if (!token) return texte('Service indisponible (compte de service).');
  const h = { Authorization: 'Bearer ' + token };

  // ── 3 GET en lecture seule. ⛔ on ne lit que statut + taille, aucun corps recopié. ──
  let original = null, transStatut = 0, transType = '', transTaille = null, refTotal = null;
  try { // 1) métadonnées : taille de l'original
    const r = await fetch(API + encodeURIComponent(fileId) + '?fields=size&supportsAllDrives=true', { headers: h });
    if (r.ok) { const d = await r.json(); original = d && d.size ? parseInt(d.size, 10) : null; }
  } catch (e) {}
  try { // 2) téléchargement transcodé (mimeType cible, Range 0-0 → taille sans tirer le corps)
    const r = await fetch(API + encodeURIComponent(fileId) + '/download?mimeType=video/mp4&supportsAllDrives=true', { headers: { ...h, Range: 'bytes=0-0' } });
    transStatut = r.status; transType = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    if (!/json/.test(transType)) transTaille = tailleEntete(r);
    try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {}
  } catch (e) {}
  try { // 3) alt=media (référence : l'original brut, Range 0-0 → total par content-range)
    const r = await fetch(API + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true', { headers: { ...h, Range: 'bytes=0-0' } });
    refTotal = tailleEntete(r);
    try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {}
  } catch (e) {}
  if (original == null) original = refTotal; // repli : la taille de référence si les métadonnées n'ont rien donné

  // ── Verdict : la MESURE, pas la décision. Trois issues explicites. ──
  const estVideo = !!transType && !/json/.test(transType);
  let verdict;
  if (transStatut >= 400 || transStatut === 0) verdict = 'Google refuse cette voie (statut ' + transStatut + ').';
  else if (!estVideo) verdict = 'Google refuse cette voie (réponse non-vidéo, statut ' + transStatut + ').';
  else if (transTaille != null && original != null && transTaille < original) verdict = 'Google sert un rendu plus léger par cette voie : ' + transTaille + ' octets contre ' + original + ' pour l\'original. Reste à vérifier qu\'il est lisible.';
  else verdict = 'Google ne sert que l\'original par cette voie.';

  return texte(
    'VERDICT : ' + verdict + '\n\n' +
    'Mesures :\n' +
    '  Original                        : ' + (original != null ? original + ' octets (' + Mo(original) + ')' : 'inconnue') + '\n' +
    '  Transcodé (files.download mp4)  : statut ' + transStatut + (transType ? ' · type ' + transType : '') + '\n' +
    '  Taille servie par le transcodé  : ' + (estVideo && transTaille != null ? transTaille + ' octets (' + Mo(transTaille) + ')' : 'sans objet') + '\n'
  );
};
