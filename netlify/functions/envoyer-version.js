// netlify/functions/envoyer-version.js
// Lot G tranche 2 — « Envoyer au client » : pose « Date envoi client » sur UNE page de 📹 Versions.
// Ce champ porte toute la numérotation client et décide de ce que le client voit ; rien d'autre dans l'app
// ne l'écrit. Le geste que l'équipe fait déjà (livrer) devient celui qui écrit la donnée.
//
// ÉCRITURE IDEMPOTENTE, garantie CÔTÉ SERVEUR : une date déjà posée n'est JAMAIS réécrite (règle métier —
// une version montrée au client garde son numéro pour toujours). On lit la page, et si la date existe on
// renvoie l'existante sans écrire. Le proxy (notion.js) relaie un PATCH membre sans condition et est
// interdit de modification → il ne peut pas porter cette garde ; on passe donc par une fonction dédiée,
// patron access-set / code-reset (Notion en direct, NOTION_TOKEN).
//
// APPELANT : membre authentifié NON-Externe. Envoyer au client est une action de production client-facing ;
// un contributeur Externe (cloisonné) ne la déclenche pas. Pas de restriction au chef : ce serait plus
// strict que valider/ajouter une version, et se contournerait par le proxy — on retomberait sur des champs vides.

const { verifyUser } = require('./_auth');

const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const norm = (s) => String(s || '').replace(/-/g, '').toLowerCase();

function notionFetch(pathApi, method, token, bodyObj) {
  return fetch('https://api.notion.com/v1' + pathApi, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('envoyer-version indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  // ── Membre authentifié NON-Externe ──
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) };
  // DEUX gardes, les deux requises (on ne remplace pas l'une par l'autre) :
  //  • Externe → 403 D'ABORD : un contributeur cloisonné n'envoie jamais, même si son rôle disait Brand.
  if (auth.user.acces === 'Externe') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé à l\'équipe' }) };
  //  • Action CLIENT-FACING réservée aux Brand et aux Chefs (même règle que les 4 gardes de l'app).
  //    ⚠️ _auth.js lit un rôle ABSENT comme 'Journaliste' (défaut FAIL-CLOSED, à NE PAS « corriger ») →
  //    un membre sans rôle explicite Brand/Chef est donc refusé ici, ce qui est VOULU : pas d'envoi client
  //    sans rôle qui l'autorise. Les 6 rôles réels : Chef·Journaliste·Monteur·Pigiste·Brand·Compta ; seuls
  //    Brand et Chef passent.
  if (auth.user.role !== 'Brand' && auth.user.role !== 'Chef') {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux contacts Brand ou aux chefs' }) };
  }

  const versionId = String(body.versionId || '').trim();
  if (!versionId) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'versionId manquant' }) };

  // ── Relire la VERSION : la borner à DB_VERSIONS ; lire la date existante ET le « Sujet ID » ──
  let version;
  try {
    const r = await notionFetch('/pages/' + versionId, 'GET', token);
    if (r.status === 404) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Version introuvable' }) };
    if (!r.ok) throw new Error('GET version ' + r.status);
    version = await r.json();
  } catch (e) { console.error('envoyer-version indispo (lecture version) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  if (!version.parent || norm(version.parent.database_id) !== norm(DB_VERSIONS)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Page hors 📹 Versions' }) };
  }

  // ── Résoudre le SUJET depuis « Sujet ID » (champ TEXTE, pas une relation : 192/863 lignes ne pointent
  //    vers aucun sujet — « test », « archived », vide…). Donnée cassée → 422, DISTINCT du 503 : l'équipe
  //    doit lire « donnée à corriger dans Notion », pas « panne, retente » (le retry ne répare pas « test »).
  //    GARDE POSÉE AVANT la visibilité ET la date : si on ne peut pas résoudre le sujet, on n'écrit RIEN —
  //    ni case ni date. On distingue la donnée cassée (id absent/malformé/introuvable → 422) de la panne
  //    (5xx/réseau → 503). ──
  const DATA_CASSEE = { statusCode: 422, headers, body: JSON.stringify({ ok: false, error: 'Cette version n\'est reliée à aucun projet (Sujet ID invalide) — à corriger dans Notion, ce n\'est pas une panne de service.' }) };
  const sujetRef = ((version.properties && version.properties['Sujet ID'] && version.properties['Sujet ID'].rich_text) || []).map(function (t) { return t.plain_text || ''; }).join('').trim();
  if (!/^[0-9a-f]{32}$/.test(norm(sujetRef))) return DATA_CASSEE; // absent / malformé → aucun GET inutile

  let sujet;
  try {
    const r = await notionFetch('/pages/' + sujetRef, 'GET', token);
    if (r.status === 404 || r.status === 400) return DATA_CASSEE; // bien formé mais introuvable / rejeté → donnée cassée
    if (!r.ok) throw new Error('GET sujet ' + r.status);          // 5xx / autre → panne
    sujet = await r.json();
  } catch (e) { console.error('envoyer-version indispo (lecture sujet) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  if (!sujet.parent || norm(sujet.parent.database_id) !== norm(DB_PROD)) return DATA_CASSEE; // résout mais pas un projet

  // ── Étape 1 : ASSURER la visibilité sur le SUJET — c'est la PORTE de l'espace (le portier filtre
  //    « Visible espace client »). Idempotent : déjà coché → pas de réécriture. Échec → 503, et on NE pose
  //    PAS la date : sans visibilité, le client est verrouillé dehors (« date sans case » est l'état interdit). ──
  const dejaVisible = !!(sujet.properties && sujet.properties['Visible espace client'] && sujet.properties['Visible espace client'].checkbox);
  if (!dejaVisible) {
    try {
      const r = await notionFetch('/pages/' + sujetRef, 'PATCH', token, { properties: { 'Visible espace client': { checkbox: true } } });
      if (!r.ok) throw new Error('PATCH visible ' + r.status);
    } catch (e) { console.error('envoyer-version indispo (visibilité) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  }

  // ── Étape 2 : la DATE sur la VERSION. Idempotent : déjà posée → dejaEnvoye (la visibilité vient d'être
  //    assurée ci-dessus — y compris pour un projet daté mais pas encore visible : auto-réparation). Le
  //    numéro client est figé pour toujours. ──
  const existante = version.properties && version.properties['Date envoi client'] && version.properties['Date envoi client'].date && version.properties['Date envoi client'].date.start;
  if (existante) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dejaEnvoye: true, date: existante }) };

  const aujourdHui = new Date().toISOString().slice(0, 10); // date au jour (le portier départage un même jour par id de page)
  try {
    const r = await notionFetch('/pages/' + versionId, 'PATCH', token, { properties: { 'Date envoi client': { date: { start: aujourdHui } } } });
    if (!r.ok) throw new Error('PATCH date ' + r.status);
  } catch (e) { console.error('envoyer-version indispo (date) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, date: aujourdHui }) };
};
