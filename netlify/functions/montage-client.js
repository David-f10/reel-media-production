// netlify/functions/montage-client.js
// Lot G tranche 2 — vue montage client, côté Notion : les LECTURES (liste des versions avec numéro
// CLIENT + état, retours de la version affichée) et l'AJOUT d'un retour. RIEN d'irréversible ici : un
// retour ajouté est un BROUILLON, supprimable. Les deux actions terminales (valider / envoyer mes
// retours) vivent dans valider-client.js, séparées, parce qu'elles ne se défont pas.
//
// Toute opération passe par le portier unique _montageclient.autoriserMontage (jeton de session +
// contact actif LIVE + sujet dans le périmètre de la marque). N'utilise PAS le proxy équipe. CORS
// restreint (F4), comme projets-client.
//
// LE PIÈGE DE CETTE BRIQUE (tranché explicitement) — la numérotation :
//   • Le client ne connaît QUE son numéro (le rang 1..N par Date envoi client). Il ne voit jamais le
//     numéro interne V1-V9.
//   • Le champ `Version` de DB_RETOURS attend le numéro INTERNE (c'est lui que l'équipe lit, et que
//     review.html écrit). Écrire le numéro client dedans rendrait les retours de l'espace et ceux de
//     review INCOMPARABLES.
//   • Donc : le serveur dérive le `Version` interne depuis la page DB_VERSIONS de la version COURANTE
//     (portée par le portier dans versions[].brut) et l'écrit. Le rang client n'est JAMAIS écrit.
//
// Estampillage SERVEUR non négociable à l'ajout : Auteur (= nom du contact lu en live), Source='Client',
// Contact client (= id de page du contact). Le navigateur ne choisit aucune de ces valeurs : même s'il
// les envoie dans le corps, elles sont ignorées.

const { autoriserMontage } = require('./_montageclient');

const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';
const MAX_TEXTE = 5000;
const MAX_TC = 120;

// Options FERMÉES du select « Catégorie » de 📋 Retours. DOIT RESTER ALIGNÉE sur les options du select
// Catégorie de 📋 Retours : deux endroits à tenir (ici ET Notion) si Master en ajoute une un jour.
// Un select Notion CRÉE l'option quand on y écrit un nom inconnu → toute valeur libre du navigateur
// polluerait DURABLEMENT la taxonomie de l'équipe (elle resterait dans tous ses filtres). On n'écrit
// donc JAMAIS que l'une de ces huit chaînes, choisie par la valeur client ; hors liste → champ OMIS
// (le retour reste écrit, non catégorisé : on ne perd pas la parole d'un client pour une étiquette).
const CATEGORIES = ['🔊 Audio', '🖼 Image', '🎬 Rush', '🎨 Graphisme', '📺 Accroche', '💬 Sous-titres', '🎤 Voix', '🎵 Musique'];
// Appariement tolérant au sélecteur de variation emoji (U+FE0F) : un navigateur peut envoyer « 🖼️ Image »
// (avec VS16) là où l'option stockée est « 🖼 Image ». On compare NORMALISÉ mais on renvoie la chaîne
// CANONIQUE de CATEGORIES — jamais les octets du navigateur. Pas de correspondance → null (champ omis).
const _normCat = (s) => String(s || '').replace(/️/g, '').trim();
function categorieCanonique(entree) {
  const n = _normCat(entree);
  if (!n) return null;
  return CATEGORIES.find(c => _normCat(c) === n) || null;
}

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}

const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _cb = (pr, k) => !!(pr && pr[k] && pr[k].checkbox);
const _title = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const _dateSet = (pr, k) => !!(pr && pr[k] && pr[k].date && pr[k].date.start);
// Version INTERNE (V1-V9) portée par la page DB_VERSIONS de la version client.
const _versionInterne = (v) => (v && v.brut && v.brut.properties && v.brut.properties.Version
  && v.brut.properties.Version.select && v.brut.properties.Version.select.name) || '';

async function notionFetch(pathApi, method, token, bodyObj) {
  const r = await fetch('https://api.notion.com/v1' + pathApi, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  if (!r.ok) throw new Error(method + ' ' + pathApi.slice(0, 16) + ' ' + r.status);
  return r.json();
}

// Tous les retours CLIENT d'un sujet (clé = id de page). Source='Client' seulement (le reste = interne
// équipe, hors espace). Pagination bornée. Lève en cas d'erreur → l'appelant rend 503 (jamais [] faux).
async function retoursClientDuSujet(sujetPageId, token) {
  const out = [];
  let cursor = null, pages = 0;
  do {
    const body = { filter: { property: 'Sujet ID', rich_text: { equals: sujetPageId } }, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const d = await notionFetch('/databases/' + DB_RETOURS + '/query', 'POST', token, body);
    for (const r of d.results || []) {
      if (_sel(r.properties, 'Source') === 'Client') out.push(r);
    }
    cursor = d.has_more ? d.next_cursor : null;
    pages++;
  } while (cursor && pages < 5);
  return out;
}

// État d'une version DU POINT DE VUE DU CLIENT :
//   'validee'         — Date validation client posée sur la version (terminal) ;
//   'retours-envoyes' — il a envoyé ses retours en ligne pour cette version (Source='Client' +
//                       'Déposé en ligne' + !Brouillon) : ce tour est clos ;
//   'a-relire'        — sinon (envoyée, rien fait).
// On exige 'Déposé en ligne' : c'est l'action DU CLIENT qui clôt un tour, pas une transcription d'équipe.
function etatVersion(v, retours) {
  if (_dateSet(v.brut && v.brut.properties, 'Date validation client')) return 'validee';
  const vi = _versionInterne(v);
  const envoyes = retours.some(r => _sel(r.properties, 'Version') === vi
    && _cb(r.properties, 'Déposé en ligne') && !_cb(r.properties, 'Brouillon'));
  return envoyes ? 'retours-envoyes' : 'a-relire';
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const action = String(body.action || '');
  const sujetCode = String(body.sujetCode || '').trim();
  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('montage-client indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  // ── Portier UNIQUE : identité + périmètre + versions client. Réserve 2 : son statut est propagé tel quel.
  const az = await autoriserMontage(event, { sujetCode });
  if (!az.ok) {
    const msg = az.statut === 403 ? 'Accès refusé' : (az.statut === 401 ? 'Authentification requise' : 'Service temporairement indisponible');
    return { statusCode: az.statut, headers, body: JSON.stringify({ ok: false, error: msg }) };
  }

  // ── LECTURE ────────────────────────────────────────────────────────────────
  if (action === 'lire') {
    let retours;
    try { retours = await retoursClientDuSujet(az.sujet.pageId, token); }
    catch (e) { console.error('montage-client indispo : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

    const versions = az.versions.map(v => ({ rang: v.rang, dateEnvoi: v.dateEnvoi, etat: etatVersion(v, retours) }));
    const courante = az.courante ? { rang: az.versions[az.versions.length - 1].rang } : null;

    // Version affichée = rang demandé (défaut : courante). Hors bornes → on retombe sur la courante
    // plutôt que d'échouer (une lecture ne casse pas pour un rang douteux).
    let idx = az.versions.length - 1;
    if (body.rang != null) {
      const demande = parseInt(body.rang, 10);
      if (Number.isInteger(demande) && demande >= 1 && demande <= az.versions.length) idx = demande - 1;
    }
    const vAffichee = az.versions[idx] || null;
    const viAffichee = vAffichee ? _versionInterne(vAffichee) : '';

    // Retours CLIENT de la version affichée → champs d'AFFICHAGE seulement (jamais le Version interne,
    // ni la Série, ni le Sujet ID : aucun numéro/champ interne ne descend au client, spec §8).
    const retoursAffiches = vAffichee ? retours
      .filter(r => _sel(r.properties, 'Version') === viAffichee)
      .map(r => ({
        timecode: _rt(r.properties, 'Timecode'),
        categorie: _sel(r.properties, 'Catégorie'),
        texte: _title(r.properties, 'Description'),
        statut: _sel(r.properties, 'Statut') || 'Ouvert',
        brouillon: _cb(r.properties, 'Brouillon'),
        auteur: _rt(r.properties, 'Auteur')
      })) : [];

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        marque: az.contact.marque || '',
        titre: az.sujet.titre || '',
        versions,                                   // [{ rang, dateEnvoi, etat }]
        courante,                                   // { rang } | null (null = rien encore envoyé)
        affichee: vAffichee ? { rang: vAffichee.rang } : null,
        retours: retoursAffiches
      })
    };
  }

  // ── AJOUT D'UN RETOUR (brouillon, réversible) ───────────────────────────────
  if (action === 'ajouter-retour') {
    // Le retour s'attache TOUJOURS à la version COURANTE : les versions passées sont des tours clos,
    // leur formulaire n'existe pas (spec §6.2). Pas de courante → rien à relire → refus franc.
    const courante = az.versions.length ? az.versions[az.versions.length - 1] : null;
    if (!courante) return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Aucune version à relire' }) };

    const texte = String(body.texte || '').trim();
    if (!texte) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Le retour est vide' }) };
    if (texte.length > MAX_TEXTE) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Retour trop long' }) };
    const timecode = String(body.timecode || '').trim().slice(0, MAX_TC);
    // Validée contre l'ensemble FERMÉ (ci-dessus) — jamais la valeur libre du navigateur dans le select.
    const categorie = categorieCanonique(body.categorie);

    // Version INTERNE de la courante — JAMAIS le rang client. C'est ce lien qui garde les retours de
    // l'espace comparables avec ceux de review.
    const versionInterne = _versionInterne(courante);
    if (!versionInterne) { console.error('montage-client : version interne absente sur la courante ' + courante.pageId); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

    // Estampillage SERVEUR. Tout ce qui est identité/provenance vient du contact relu en live et du
    // portier — jamais du corps de la requête.
    const props = {
      'Description': { title: [{ text: { content: texte } }] },
      'Version': { select: { name: versionInterne } },              // ← interne, dérivé serveur
      'Timecode': { rich_text: [{ text: { content: timecode } }] },
      'Statut': { select: { name: 'Ouvert' } },
      'Auteur': { rich_text: [{ text: { content: az.contact.nom || '' } }] },   // ← fiche contact, live
      'Demandé par': { rich_text: [{ text: { content: az.contact.nom || '' } }] },
      'Sujet ID': { rich_text: [{ text: { content: az.sujet.pageId } }] },
      'Sujet titre': { rich_text: [{ text: { content: az.sujet.titre || '' } }] },
      'Source': { select: { name: 'Client' } },                     // ← serveur
      'Contact client': { rich_text: [{ text: { content: az.contact.id } }] }, // ← id de page du contact, serveur
      'Brouillon': { checkbox: true },
      'Déposé en ligne': { checkbox: true }
    };
    if (categorie) props['Catégorie'] = { select: { name: categorie } };

    let created;
    try { created = await notionFetch('/pages', 'POST', token, { parent: { database_id: DB_RETOURS }, properties: props }); }
    catch (e) { console.error('montage-client indispo : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, retourId: created.id }) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };
};

// Exposés pour le banc isolé (non utilisés par le handler autrement).
module.exports._test = { etatVersion, retoursClientDuSujet };
