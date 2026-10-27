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
  if (auth.user.acces === 'Externe') return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé à l\'équipe' }) };

  const versionId = String(body.versionId || '').trim();
  if (!versionId) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'versionId manquant' }) };

  // ── Relire la page : la borner à DB_VERSIONS ET lire la date existante (la garde d'idempotence) ──
  let page;
  try {
    const r = await notionFetch('/pages/' + versionId, 'GET', token);
    if (r.status === 404) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Version introuvable' }) };
    if (!r.ok) throw new Error('GET ' + r.status);
    page = await r.json();
  } catch (e) { console.error('envoyer-version indispo (lecture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  const parent = page && page.parent && page.parent.database_id;
  if (!parent || norm(parent) !== norm(DB_VERSIONS)) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Page hors 📹 Versions' }) };
  }

  // ── IDEMPOTENCE : date déjà posée → on NE réécrit JAMAIS. Le numéro client est figé pour toujours. ──
  const existante = page.properties && page.properties['Date envoi client'] && page.properties['Date envoi client'].date && page.properties['Date envoi client'].date.start;
  if (existante) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dejaEnvoye: true, date: existante }) };

  // Date au JOUR (confirmé : pas de datetime ; le portier départage deux envois d'un même jour par id de page).
  const aujourdHui = new Date().toISOString().slice(0, 10);
  try {
    const r = await notionFetch('/pages/' + versionId, 'PATCH', token, { properties: { 'Date envoi client': { date: { start: aujourdHui } } } });
    if (!r.ok) throw new Error('PATCH ' + r.status);
  } catch (e) { console.error('envoyer-version indispo (écriture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, date: aujourdHui }) };
};
