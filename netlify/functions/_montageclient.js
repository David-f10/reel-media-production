// netlify/functions/_montageclient.js
// Lot G tranche 2 — PORTIER de la vue montage client. UNE seule frontière, appelée par les TROIS
// fonctions de la lane client montage : montage-client.js (lectures + ajout de retour),
// valider-client.js (les deux actions terminales), drive-view-client.js (lecture vidéo).
// Rien de la lane équipe/review ne passe ici — cloisonnement de lanes, doctrine de _authclient.js :
// la porte des sept (notion.js / _auth.js / login.js) ne bouge pas, et le code qui sert un client ne
// sert jamais aussi un membre ou un jeton de review.
//
// Les QUATRE conditions validées (§2), TOUTES requises. (3)/(4) portent sur un fichier : le portier
// les fournit en données, chaque appelant applique CELLE qui le concerne.
//   (1) jeton de session client valide (signature + exp)  ET  contact ACTIF relu en LIVE
//       (révocation ~60 s). Réserve 2 : échec → statut 401/503, JAMAIS un périmètre vide.
//   (2) le sujetCode présenté ∈ projetsDeMarque(codeBrand) — préfixe marque + Visible espace client
//       + Format=Brand (gate audité de _perimetreclient, SOURCE UNIQUE de « ce qui est exposé »).
//   (3) [TÉLÉCHARGEMENT, tranche 4] fileId ∈ A∪B du sujet. HORS SCOPE de la tranche montage, qui
//       n'ouvre que la vidéo — point d'extension laissé explicite (voir note en bas), pas implémenté.
//   (4) [VIDÉO] fileId === celui de la version COURANTE client. Décision de David : les versions
//       passées ne sont PAS regardables — leurs retours restent lisibles, la vidéo non.
//
// Réserve 2 partout : toute panne (jeton config absente, Notion en erreur, périmètre en échec) rend
// un statut DISTINGUABLE (503), jamais « aucune version » ni « sujet inconnu » mensonger. Un sujet
// RÉELLEMENT exposé mais sans version encore envoyée est un vrai vide légitime (versions:[]), pas une
// panne. Aucune exception propagée (l'appelant lit ok/statut). Aucune URL ni valeur de secret loggée.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { projetsDeMarque } = require('./_perimetreclient');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const DEFAULT_BUDGET_MS = 6000;

// extractFileId : copie INLINE et fidèle de _drive.js. Le portier est Notion-seul ; on n'y tire pas
// les dépendances Google de _drive.js. Duplication d'un pur helper de chaîne (coût assumé du
// cloisonnement) : si la forme des liens Drive change, cette copie et celle de _drive.js bougent ensemble.
function extractFileId(raw) {
  if (!raw) return '';
  const s = String(raw);
  const m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : '';
}

const _titre = (pr) => ((pr && pr['Titre'] && pr['Titre'].title) || []).map(t => t.plain_text || '').join('');
const _titreSujet = _titre; // DB_PROD porte aussi le film dans une propriété title 'Titre'
const _dateEnvoi = (pr) => (pr && pr['Date envoi client'] && pr['Date envoi client'].date && pr['Date envoi client'].date.start) || '';

async function _query(dbId, body, token) {
  const r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error('query ' + String(dbId).slice(0, 4) + ' ' + r.status);
  return r.json();
}

// Versions CLIENT d'un sujet (clé = id de PAGE du sujet, comme 'Sujet ID' dans DB_VERSIONS), ordonnées
// par Date envoi client. Seules les versions ENVOYÉES au client (date posée) existent pour lui ; le rang
// 1..N est le numéro client (§3 : une version montrée garde son numéro pour toujours — la date d'envoi
// est immuable une fois posée, donc le rang ne glisse plus). La COURANTE = rang le plus élevé (dernière
// envoyée) = la SEULE dont la vidéo s'ouvre (condition 4).
async function _versionsClient(sujetPageId, token) {
  const versions = [];
  let cursor = null, pages = 0;
  do {
    const body = { filter: { property: 'Sujet ID', rich_text: { equals: sujetPageId } }, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const d = await _query(DB_VERSIONS, body, token);
    for (const v of d.results || []) {
      const pr = v.properties || {};
      const dateEnvoi = _dateEnvoi(pr);
      if (!dateEnvoi) continue; // pas encore envoyée au client → n'existe pas dans son espace
      versions.push({ pageId: v.id, fileId: extractFileId(_titre(pr)), dateEnvoi, brut: v });
    }
    cursor = d.has_more ? d.next_cursor : null;
    pages++;
  } while (cursor && pages < 5);
  // Tri par date d'envoi ascendante ; départage STABLE par pageId quand deux dates sont égales (le rang
  // doit être déterministe même si deux versions partagent une date).
  versions.sort((a, b) => (a.dateEnvoi < b.dateEnvoi ? -1 : a.dateEnvoi > b.dateEnvoi ? 1 : (a.pageId < b.pageId ? -1 : 1)));
  versions.forEach((v, i) => { v.rang = i + 1; });
  return versions;
}

// autoriserMontage(event, { sujetCode }, deadline?) — conditions (1) et (2), puis résolution des
// versions client. Contrat de sortie (réserve 2) :
//   { ok:false, statut:401 } — session invalide/expirée OU contact désactivé/disparu → l'appelant re-login
//   { ok:false, statut:503 } — config absente / Notion indisponible / périmètre en échec
//   { ok:false, statut:403 } — sujetCode HORS du périmètre exposé de la marque
//   { ok:true, contact:{ id, codeBrand, marque }, sujet:{ code, pageId },
//              versions:[{ pageId, fileId, dateEnvoi, rang, brut }], courante:{ pageId, fileId } | null }
async function autoriserMontage(event, params, deadline) {
  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('montage client indispo : NOTION_TOKEN=' + !!token); return { ok: false, statut: 503 }; }
  const dl = deadline || (Date.now() + DEFAULT_BUDGET_MS);

  // (1) Identité — jeton de session, puis contact relu EN LIVE (Actif + Code Brand courant).
  const h = (event && event.headers) || {};
  const jeton = h['x-rmc-token'] || h['X-Rmc-Token'] || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { ok: false, statut: vt.raison === 'config' ? 503 : 401 }; // config absente = panne, pas un refus
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { ok: false, statut: liv.raison === 'indispo' ? 503 : 401 }; // désactivé/disparu → re-login
  const codeBrand = liv.codeBrand;

  const sujetCode = String((params && params.sujetCode) || '').trim();
  if (!sujetCode) return { ok: false, statut: 403 };

  // (2) Périmètre — le sujetCode doit appartenir aux projets EXPOSÉS de la marque. On ne refait pas les
  // gardes à la main : projetsDeMarque est la source unique (préfixe + Visible + Brand). Échec de calcul
  // → 503 (jamais « hors périmètre » ni un vide : un refus et une panne ne se ressemblent pas).
  const per = await projetsDeMarque(codeBrand, token, dl);
  if (!per.ok) return { ok: false, statut: 503 };
  if (!per.projets.some(p => p.code === sujetCode)) return { ok: false, statut: 403 };

  // Id de PAGE du sujet (projetsDeMarque ne le renvoie pas) — lecture ciblée, re-confirme l'existence.
  let sujetPage;
  try {
    const d = await _query(DB_PROD, { filter: { property: 'Code', rich_text: { equals: sujetCode } }, page_size: 1 }, token);
    sujetPage = d.results && d.results[0];
  } catch (e) { console.error('montage client indispo : ' + (e && e.message || '')); return { ok: false, statut: 503 }; }
  if (!sujetPage) return { ok: false, statut: 403 }; // listé au périmètre mais introuvable à la relecture → refus franc

  // Versions client ordonnées (numéro client + courante). Échec Notion → 503, pas un faux « 0 version ».
  let versions;
  try { versions = await _versionsClient(sujetPage.id, token); }
  catch (e) { console.error('montage client indispo : ' + (e && e.message || '')); return { ok: false, statut: 503 }; }

  const derniere = versions.length ? versions[versions.length - 1] : null;
  const courante = derniere ? { pageId: derniere.pageId, fileId: derniere.fileId } : null;

  return {
    ok: true,
    contact: { id: vt.id, nom: liv.nom || '', codeBrand, marque: liv.marque || '' }, // nom : estampillage serveur de l'Auteur d'un retour (fiche lue en live)
    sujet: { code: sujetCode, pageId: sujetPage.id, titre: _titreSujet(sujetPage.properties) },
    versions,
    courante // null = sujet exposé mais aucune version encore envoyée (vrai vide, PAS une panne)
  };
}

// (4) VIDÉO — seule la version COURANTE est regardable (décision de David : les versions passées ne se
// lisent pas). L'appelant (drive-view-client) passe le résultat d'autoriserMontage + le fileId demandé.
// Fail-closed : pas de courante, pas de fileId, ou fileId ≠ courante → false.
function fichierVideoAutorise(res, fileId) {
  const fid = extractFileId(fileId);
  return !!(res && res.ok && res.courante && res.courante.fileId && fid && fid === res.courante.fileId);
}

// NOTE tranche 4 (téléchargement) : la condition (3) — fileId ∈ A∪B du sujet, versions passées INCLUSES
// — s'ajoutera ici (un fichierTelechargementAutorise + la dérivation A∪B), sans toucher ce qui précède.
// Elle est volontairement absente tant que seul le visionnage existe.

module.exports = { autoriserMontage, fichierVideoAutorise, extractFileId };
