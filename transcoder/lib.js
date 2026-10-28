// transcoder/lib.js — helpers PURS du worker de transcodage (aucune E/S), isolés pour être testés sans
// ffmpeg, sans Drive, sans bucket. Le reste (server.js) les câble aux E/S.

// Clé d'objet DÉTERMINISTE dans le bucket : version + fileId master → idempotence (un re-run réutilise le
// même objet). On assainit (on ne garde que [A-Za-z0-9_-]) pour éviter toute traversée de chemin / caractère
// douteux venu d'une entrée. Préfixe de dossier fixe.
function cleObjet(versionId, masterFileId) {
  const propre = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '');
  const v = propre(versionId), m = propre(masterFileId);
  if (!v || !m) throw new Error('cleObjet : versionId et masterFileId requis');
  return 'proxies/' + v + '__' + m + '.mp4';
}

// Filtre ffmpeg : PETIT CÔTÉ calé à `shortEdge` quelle que soit l'orientation (le parc a du vertical ET de
// l'horizontal), aspect préservé, dimension paire (-2), et JAMAIS d'agrandissement (min(shortEdge, côté réel)).
//   portrait/carré (iw<=ih) → largeur = min(shortEdge, iw), hauteur auto
//   paysage        (iw> ih) → hauteur = min(shortEdge, ih), largeur auto
function filtreScale(shortEdge) {
  const s = parseInt(shortEdge, 10);
  if (!Number.isInteger(s) || s < 2) throw new Error('filtreScale : shortEdge invalide');
  return "scale=w='if(lte(iw,ih),min(" + s + "\\,iw),-2)':h='if(lte(iw,ih),-2,min(" + s + "\\,ih))'";
}

// Débit vidéo cible en kbps. Défaut = `defautKbps` (ce que David a validé à l'œil, ~2500). Si un cap de poids
// `capMo` est fourni ET la durée connue, on CALCULE le débit depuis la durée réelle pour ne pas dépasser le
// poids sur un sujet long : capVideo = poids_total_kbit/durée − audio. On prend le PLUS BAS des deux.
function debitVideoKbps({ dureeSec, defautKbps, capMo, audioKbps }) {
  const def = parseInt(defautKbps, 10);
  if (!Number.isInteger(def) || def <= 0) throw new Error('debitVideoKbps : defautKbps invalide');
  const cap = parseFloat(capMo), dur = parseFloat(dureeSec), aud = parseInt(audioKbps, 10) || 0;
  if (!(cap > 0) || !(dur > 0)) return def; // pas de cap exploitable → on garde le défaut validé
  const capVideo = Math.floor((cap * 8192) / dur) - aud; // 1 Mo = 8192 kbit
  if (!(capVideo > 0)) return def; // cap absurde (sujet énorme) → on ne descend pas sous le défaut ici
  return Math.min(def, capVideo);
}

// Audio : COPIE si la source est déjà de l'AAC (on ne ré-encode pas pour rien), sinon transcode en AAC. On
// ne SUPPOSE pas : `codecSource` vient d'un ffprobe réel (server.js).
function argsAudio(codecSource, aacKbps) {
  if (String(codecSource || '').toLowerCase() === 'aac') return ['-c:a', 'copy'];
  const k = parseInt(aacKbps, 10) || 128;
  return ['-c:a', 'aac', '-b:a', k + 'k'];
}

// Arguments ffmpeg complets. H.264 / yuv420p / +faststart = on CONSERVE le domaine déjà compatible <video>
// (le master l'est déjà, ffprobe le confirme) ; on ne touche qu'au DÉBIT et à la taille. ABR mono-passe
// (une seule lecture de l'entrée) + maxrate/bufsize pour borner les pics.
function construireArgsFfmpeg({ entree, sortie, shortEdge, videoKbps, preset, audioArgs, maxrateFacteur }) {
  const vk = parseInt(videoKbps, 10);
  if (!entree || !sortie) throw new Error('construireArgsFfmpeg : entree et sortie requises');
  if (!Number.isInteger(vk) || vk <= 0) throw new Error('construireArgsFfmpeg : videoKbps invalide');
  const fac = parseFloat(maxrateFacteur) > 0 ? parseFloat(maxrateFacteur) : 1.45;
  return [
    '-y',
    '-i', entree,
    '-vf', filtreScale(shortEdge),
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', String(preset || 'slow'),
    '-b:v', vk + 'k', '-maxrate', Math.round(vk * fac) + 'k', '-bufsize', (vk * 2) + 'k',
    ...(Array.isArray(audioArgs) ? audioArgs : ['-c:a', 'aac', '-b:a', '128k']),
    '-movflags', '+faststart',
    sortie
  ];
}

// Lit le codec audio et la durée (ms) d'une sortie ffprobe JSON (-show_format -show_streams). Pur.
function lireFfprobe(probeJson) {
  const j = probeJson || {};
  const streams = Array.isArray(j.streams) ? j.streams : [];
  const audio = streams.find(s => s && s.codec_type === 'audio');
  const dureeSec = parseFloat(j.format && j.format.duration);
  return {
    codecAudio: audio ? String(audio.codec_name || '') : '',
    aUneVideo: streams.some(s => s && s.codec_type === 'video'),
    dureeSec: Number.isFinite(dureeSec) ? dureeSec : null,
    dureeMs: Number.isFinite(dureeSec) ? Math.round(dureeSec * 1000) : null
  };
}

module.exports = { cleObjet, filtreScale, debitVideoKbps, argsAudio, construireArgsFfmpeg, lireFfprobe };
