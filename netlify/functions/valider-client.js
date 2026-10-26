// netlify/functions/valider-client.js
// Lot G tranche 2 — les DEUX actions TERMINALES de la vue montage client, et RIEN d'autre. Elles ne se
// défont pas (l'une envoie le film en diffusion, l'autre clôt un tour et lance une nouvelle version), donc
// elles vivent seules, sur un écran, relisibles d'un bloc avant toute modification. Les lectures et l'ajout
// (réversibles) sont dans montage-client.js.
//
//   POST { action:'valider' | 'envoyer-retours', sujetCode, nbVersions } + en-tête x-rmc-token
//
// CONTRAT (non négociable) :
//   • L'ÉCRITURE NOTION D'ABORD, LA RÉPONSE ENSUITE. Le client ne lit « version validée » / « retours
//     envoyés » que si Notion a confirmé l'écriture PRIMAIRE. Échec → 503 (ou partiel), jamais un faux succès.
//   • LA NOTIFICATION DE L'ÉQUIPE EST BEST-EFFORT, APRÈS l'écriture primaire : son échec se LOGGE, ne fait
//     pas échouer l'action, et ne se transforme pas en succès (la réponse ne dépend que de l'écriture primaire).
//   • Signalement d'équipe = chemin. valider-client porte un jeton CLIENT → il ne peut PAS appeler notify.js
//     (qui exige un membre ou un jeton de review). Il crée donc lui-même les pages 📥 Notifications (la SOURCE
//     de la cloche équipe), une par destinataire, best-effort. Le push Web instantané de notify.js n'est PAS
//     répliqué ici (il exigerait VAPID + Blobs + web-push → hors « un écran », et toucherait la lane équipe
//     si on le partageait) : la cloche reste alimentée. Enhancement signalé dans la PR, pas décidé en douce.
//
// INVARIANT (spec §4) : une version validée est TOUJOURS la dernière. Si une version plus récente a été
// envoyée depuis le chargement de la page du client, son action est PÉRIMÉE → refus franc (409 perime:true),
// AUCUNE écriture. On le détecte par le nombre de versions que le client a vu (nbVersions) vs le nombre réel.

const { autoriserMontage } = require('./_montageclient');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';
const DB_NOTIFS = '4398775b-c11f-4d73-99c4-9fc31c33ce8b';

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _cb = (pr, k) => !!(pr && pr[k] && pr[k].checkbox);
const _dateSet = (pr, k) => !!(pr && pr[k] && pr[k].date && pr[k].date.start);

async function notionFetch(pathApi, method, token, bodyObj) {
  const r = await fetch('https://api.notion.com/v1' + pathApi, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  if (!r.ok) throw new Error(method + ' ' + pathApi.slice(0, 16) + ' ' + r.status);
  return r.json();
}

// Signalement d'équipe — BEST-EFFORT de bout en bout : jamais une exception ne remonte, chaque échec se
// logge (présence, aucun secret). Lit le sujet pour ses destinataires (mêmes que la lane review :
// chef, journaliste, contacts Brand, monteur de CETTE version interne), puis une page 📥 Notifications
// par destinataire. Jamais appelé avant que l'écriture primaire ait réussi.
async function signalerEquipe(az, internalV, type, message, token) {
  try {
    const sujet = await notionFetch('/pages/' + az.sujet.pageId, 'GET', token);
    const pr = (sujet && sujet.properties) || {};
    const set = new Set();
    set.add(_sel(pr, 'Chef responsable'));
    set.add(_sel(pr, 'Journaliste'));
    set.add(_sel(pr, 'Contact Brand'));
    set.add(_sel(pr, 'Contact Brand 2'));
    const mMonteur = /^V(\d+)$/.exec(internalV || '');
    if (mMonteur) set.add(_sel(pr, 'Monteur V' + mMonteur[1]));
    const destinataires = [...set].filter(Boolean);
    for (const dest of destinataires) {
      try {
        await notionFetch('/pages', 'POST', token, {
          parent: { database_id: DB_NOTIFS },
          properties: {
            'Message': { title: [{ text: { content: message } }] },
            'Type': { select: { name: type } },
            'Destinataire': { rich_text: [{ text: { content: dest } }] },
            'Auteur': { rich_text: [{ text: { content: az.contact.nom || '' } }] },
            'Sujet ID': { rich_text: [{ text: { content: az.sujet.pageId } }] },
            'Sujet code': { rich_text: [{ text: { content: az.sujet.code } }] },
            'Sujet titre': { rich_text: [{ text: { content: az.sujet.titre || '' } }] },
            'Lu': { checkbox: false }
          }
        });
      } catch (e) { console.error('valider-client notif (best-effort) : ' + (e && e.message || '')); }
    }
  } catch (e) {
    console.error('valider-client signalement (best-effort) : ' + (e && e.message || ''));
  }
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
  if (!token) { console.error('valider-client indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  if (action !== 'valider' && action !== 'envoyer-retours') {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };
  }

  // ── Portier unique (identité + périmètre + versions). Statut propagé tel quel (réserve 2). ──
  const az = await autoriserMontage(event, { sujetCode });
  if (!az.ok) {
    const msg = az.statut === 403 ? 'Accès refusé' : (az.statut === 401 ? 'Authentification requise' : 'Service temporairement indisponible');
    return { statusCode: az.statut, headers, body: JSON.stringify({ ok: false, error: msg }) };
  }

  // La courante est la SEULE cible d'une action terminale (les versions passées sont des tours clos).
  const courante = az.versions.length ? az.versions[az.versions.length - 1] : null;
  if (!courante) return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Aucune version à relire' }) };

  // ── GARDE D'INVARIANT (spec §4) : l'action ne vaut que si le client agit sur l'état COURANT. Une version
  // plus récente envoyée depuis son chargement aurait fait grandir le nombre de versions → action périmée,
  // AUCUNE écriture. Sans ce garde, valider une version qui n'est plus la dernière casse l'invariant en silence. ──
  const nbVu = parseInt(body.nbVersions, 10);
  if (!Number.isInteger(nbVu)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètre manquant (nbVersions)' }) };
  if (nbVu !== az.versions.length) {
    return { statusCode: 409, headers, body: JSON.stringify({ ok: false, perime: true, error: 'Une version plus récente est arrivée — rechargez votre espace' }) };
  }

  const internalV = (courante.brut && courante.brut.properties && courante.brut.properties.Version
    && courante.brut.properties.Version.select && courante.brut.properties.Version.select.name) || '';
  const dejaValidee = _dateSet(courante.brut && courante.brut.properties, 'Date validation client');

  // ───────────────────────────────── VALIDER ─────────────────────────────────
  if (action === 'valider') {
    // Idempotent : déjà validée → succès sans ré-écrire ni re-notifier (anti double-fire / rechargement).
    if (dejaValidee) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dejaValide: true }) };

    // ÉCRITURE PRIMAIRE : Date validation client sur la courante. Échec → 503, surtout PAS « validée ».
    const aujourdHui = new Date().toISOString().slice(0, 10);
    try {
      await notionFetch('/pages/' + courante.pageId, 'PATCH', token, { properties: { 'Date validation client': { date: { start: aujourdHui } } } });
    } catch (e) {
      console.error('valider-client indispo (écriture validation) : ' + (e && e.message || ''));
      return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    }

    // SIGNALEMENT best-effort (après confirmation) : Statut sujet + cloche équipe. Échec loggé, jamais remonté.
    try { await notionFetch('/pages/' + az.sujet.pageId, 'PATCH', token, { properties: { 'Statut': { select: { name: 'Validation chef' } } } }); }
    catch (e) { console.error('valider-client statut (best-effort) : ' + (e && e.message || '')); }
    await signalerEquipe(az, internalV, 'version_validee',
      `${az.contact.nom || 'Le client'} a validé la ${internalV} de ${az.sujet.code}${az.sujet.titre ? ' — ' + az.sujet.titre : ''}`, token);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // ───────────────────────────── ENVOYER MES RETOURS ─────────────────────────
  // (action === 'envoyer-retours')
  if (dejaValidee) return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Cette version est déjà validée' }) };

  // Brouillons EN LIGNE du client pour la courante (mêmes critères qu'envoyer-retours.js côté review).
  let drafts;
  try {
    const out = [];
    let cursor = null, pages = 0;
    do {
      const qb = { filter: { property: 'Sujet ID', rich_text: { equals: az.sujet.pageId } }, page_size: 100 };
      if (cursor) qb.start_cursor = cursor;
      const d = await notionFetch('/databases/' + DB_RETOURS + '/query', 'POST', token, qb);
      for (const r of d.results || []) {
        const pr = r.properties || {};
        if (_sel(pr, 'Source') === 'Client' && _cb(pr, 'Déposé en ligne') && _cb(pr, 'Brouillon') && _sel(pr, 'Version') === internalV) out.push(r);
      }
      cursor = d.has_more ? d.next_cursor : null;
      pages++;
    } while (cursor && pages < 5);
    drafts = out;
  } catch (e) {
    console.error('valider-client indispo (lecture brouillons) : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
  if (!drafts.length) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Aucun retour à envoyer' }) };

  // Série dérivée CÔTÉ SERVEUR (jamais reçue du navigateur), calculée UNE fois — même règle qu'envoyer-retours.js.
  let serie;
  try {
    const d = await notionFetch('/databases/' + DB_RETOURS + '/query', 'POST', token, {
      filter: { property: 'Sujet ID', rich_text: { equals: az.sujet.pageId } },
      sorts: [{ property: 'Série', direction: 'descending' }], page_size: 1
    });
    const top = (d.results || [])[0];
    serie = ((top && top.properties['Série'] && top.properties['Série'].number) || 0) + 1;
  } catch (e) {
    console.error('valider-client indispo (série) : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }

  // ÉCRITURE PRIMAIRE : bascule Brouillon:false + Série sur chaque brouillon. Pas de transaction Notion :
  // un échec PARTIEL laisse des brouillons cohérents (re-renvoyables ; la série posée est unique). On ne
  // répond « envoyés » (ok:true) que si TOUT a basculé — sinon ok:false, jamais un faux succès.
  let envoyes = 0, echecs = 0;
  for (const r of drafts) {
    try { await notionFetch('/pages/' + r.id, 'PATCH', token, { properties: { 'Brouillon': { checkbox: false }, 'Série': { number: serie } } }); envoyes++; }
    catch (e) { echecs++; console.error('valider-client bascule retour : ' + (e && e.message || '')); }
  }
  if (envoyes === 0) return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };

  // SIGNALEMENT best-effort (après au moins une bascule) : Statut sujet + cloche équipe.
  try { await notionFetch('/pages/' + az.sujet.pageId, 'PATCH', token, { properties: { 'Statut': { select: { name: 'Retours' } } } }); }
  catch (e) { console.error('valider-client statut (best-effort) : ' + (e && e.message || '')); }
  await signalerEquipe(az, internalV, 'retours_client',
    `${az.contact.nom || 'Le client'} a envoyé ses retours sur la ${internalV} de ${az.sujet.code}${az.sujet.titre ? ' — ' + az.sujet.titre : ''}`, token);

  // ok:true SEULEMENT si tout a basculé. Partiel → ok:false (honnête) : le client ne lit pas « envoyés ».
  return { statusCode: echecs === 0 ? 200 : 502, headers, body: JSON.stringify({ ok: echecs === 0, envoyes, echecs }) };
};
