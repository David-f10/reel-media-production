'use strict';
// ── SONDE JETABLE (diagnostic) — À SUPPRIMER APRÈS USAGE. Ce n'est PAS une fonctionnalité. ──────────────────────
// But : savoir si Google Drive sait rendre une version TRANSCODÉE (plus légère) d'une vidéo DÉPOSÉE, qu'on pourrait
// relayer nous-mêmes — ce qui supprimerait tout besoin de chaîne d'encodage (lot « saccades », analyse Partie 2).
//
// À lancer LÀ OÙ VIT LE COMPTE DE SERVICE (env Netlify ou local avec les vars du SA + googleapis installé) :
//     node tools/sonde-drive-transcodage.js <fileIdDUnMontageRéel>
//
// Il utilise getSA() de l'app (aucun secret en dur). Il lit : la taille de l'original, puis le statut + la taille
// d'une tentative de téléchargement transcodé. ⛔ Il NE journalise AUCUNE valeur : ni jeton, ni fileId, ni octets de
// contenu — seulement des STATUTS et des TAILLES (nombres). Il ne télécharge pas le corps (il lit l'en-tête de taille).

const drivePkg = require('../netlify/functions/_drive.js');
const getSA = drivePkg.getSA || (drivePkg.default && drivePkg.default.getSA);

const API = 'https://www.googleapis.com/drive/v3/files/';
const fileId = (process.argv[2] || '').trim();
const Mo = (n) => (typeof n === 'number' && isFinite(n)) ? (n / (1024 * 1024)).toFixed(1) + ' Mo' : 'inconnue';

(async () => {
  if (!fileId) { console.error('Usage : node tools/sonde-drive-transcodage.js <fileId>'); process.exit(2); }
  if (typeof getSA !== 'function') { console.error('getSA introuvable dans _drive.js (export ?)'); process.exit(2); }

  let token;
  try { const sa = await getSA(); token = sa && sa.token; }
  catch (e) { console.error('getSA a échoué : ' + (e && e.name || 'Error')); process.exit(2); }
  if (!token) { console.error('Pas de jeton SA.'); process.exit(2); }
  const h = { Authorization: 'Bearer ' + token };

  // 1) Taille de l'ORIGINAL (métadonnées, aucun téléchargement). ⛔ on ne lit que `size`.
  let origine = null;
  try {
    const r = await fetch(API + encodeURIComponent(fileId) + '?fields=size,mimeType&supportsAllDrives=true', { headers: h });
    console.log('métadonnées : statut ' + r.status);
    if (r.ok) { const d = await r.json(); origine = d && d.size ? parseInt(d.size, 10) : null; console.log('taille ORIGINAL : ' + Mo(origine)); }
    else { console.log('⚠ métadonnées inaccessibles (fileId correct ? accès du SA ?)'); }
  } catch (e) { console.error('métadonnées : échec réseau (' + (e && e.name || 'Error') + ')'); }

  // 2) Tentative de TÉLÉCHARGEMENT TRANSCODÉ (files.download v3, mimeType cible). On lit statut + en-têtes, PAS le corps.
  //    - 200 + content-length PLUS PETIT que l'original → le transcodage existe (3e voie réelle).
  //    - content-type JSON → c'est une opération asynchrone (on le signale, à creuser).
  //    - 4xx / original → pas de transcodage pour un fichier déposé.
  const essais = [
    ['files.download ?mimeType=video/mp4', API + encodeURIComponent(fileId) + '/download?mimeType=video/mp4&supportsAllDrives=true'],
    ['alt=media (référence : l\'original brut)', API + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true']
  ];
  for (const [nom, url] of essais) {
    try {
      const r = await fetch(url, { headers: Object.assign({ Range: 'bytes=0-0' }, h) }); // Range 0-0 : on ne tire pas tout
      const ct = r.headers.get('content-type') || '';
      const cr = r.headers.get('content-range') || '';
      const total = cr && cr.indexOf('/') !== -1 ? parseInt(cr.split('/').pop(), 10) : null;
      const cl = r.headers.get('content-length');
      console.log('\n' + nom + ' : statut ' + r.status + ' · type ' + (ct || 'inconnu'));
      if (total) console.log('  taille totale annoncée : ' + Mo(total));
      else if (cl) console.log('  content-length : ' + Mo(parseInt(cl, 10)));
      if (/json/.test(ct)) console.log('  ⚠ réponse JSON → probablement une OPÉRATION asynchrone (pas des octets vidéo) — à creuser.');
      try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} // ⛔ on ne consomme pas le corps
    } catch (e) { console.error(nom + ' : échec réseau (' + (e && e.name || 'Error') + ')'); }
  }

  console.log('\nVERDICT (à lire) : si « files.download » rend 200 avec une taille PLUS PETITE que l\'original → la 3e');
  console.log('voie existe (on relaie ce rendu, pas de chaîne d\'encodage). Sinon (original / 4xx / opération) → non.');
  process.exit(0);
})();
