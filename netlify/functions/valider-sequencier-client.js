// netlify/functions/valider-sequencier-client.js
// Lot G tranche 2 — VALIDATION DU SÉQUENCIER depuis l'espace client. Jusqu'ici c'est l'équipe Brand qui
// coche « Validation Client » sur la fiche projet (accord obtenu par mail/téléphone). On ouvre ce geste au
// client, et on ajoute « demander des corrections » (simple message, PAS de nouvel état).
//
// POURQUOI UN PÉRIMÈTRE DIFFÉRENT DES AUTRES FONCTIONS CLIENT (à lire avant de « factoriser » avec le
// portier montage) : le séquencier se valide AVANT tout montage. Un projet en phase séquencier n'est donc
// PAS « Visible espace client » (cette case est posée à l'ENVOI d'un montage, par envoyer-version). Le
// portier montage (autoriserMontage → projetsDeMarque) est gardé par Visible → il rejetterait ces projets.
// Le signal « prêt pour le client » du SÉQUENCIER n'est pas Visible, c'est « Validation Brand » (l'équipe a
// validé, la balle est au client). On résout donc le périmètre ici par : contact actif de la marque +
// projet Brand de SA marque (préfixe de Code + lettres) + « Validation Brand » posée. Aucune donnée de
// montage/version ne transite — seulement code/titre/séquencier.
//
// GARDES SERVEUR (l'app les impose déjà côté équipe ; le serveur DOIT les imposer aussi) :
//   • session client valide + contact actif (contactActif porte aussi la garde d'activation de la marque) ;
//   • le sujet appartient à la marque du contact (préfixe de Code + ≥1 lettre) et est au Format Brand ;
//   • « Validation Brand » est DÉJÀ posée (sinon 409 — on ne saute pas l'échelon Brand) ;
//   • idempotent : « Validation Client » déjà posée → succès sans réécrire ni re-notifier.
//
// Signalement d'équipe : BEST-EFFORT, pages 📥 Notifications créées en direct (NOTION_TOKEN), comme
// valider-client. DETTE ASSUMÉE identique : le push Web de notify.js n'est pas répliqué (coupler VAPID +
// Blobs à la lane client est précisément ce qu'on refuse). Jeton CLIENT → ne peut pas appeler notify.js.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE, PRE_TOURNAGE } = require('./_perimetreclient'); // PRE_TOURNAGE : source unique partagée

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_NOTIFS = '4398775b-c11f-4d73-99c4-9fc31c33ce8b';
const MAX_TEXTE = 2000;

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _cb = (pr, k) => !!(pr && pr[k] && pr[k].checkbox);
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}

async function notionFetch(pathApi, method, token, bodyObj) {
  const r = await fetch('https://api.notion.com/v1' + pathApi, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  if (!r.ok) throw new Error(method + ' ' + pathApi.slice(0, 16) + ' ' + r.status);
  return r.json();
}

// Signalement d'équipe (journaliste + contacts Brand), best-effort, une page par destinataire. Mirror de
// valider-client.signalerEquipe, destinataires alignés sur la notif séquencier-client de l'app équipe.
async function signalerEquipe(pr, meta, type, message, auteurNom, token) {
  try {
    const set = new Set();
    set.add(_sel(pr, 'Journaliste'));
    set.add(_sel(pr, 'Contact Brand'));
    set.add(_sel(pr, 'Contact Brand 2'));
    for (const dest of [...set].filter(Boolean)) {
      try {
        await notionFetch('/pages', 'POST', token, {
          parent: { database_id: DB_NOTIFS },
          properties: {
            'Message': { title: [{ text: { content: message } }] },
            'Type': { select: { name: type } },
            'Destinataire': { rich_text: [{ text: { content: dest } }] },
            'Auteur': { rich_text: [{ text: { content: auteurNom || '' } }] },
            'Sujet ID': { rich_text: [{ text: { content: meta.pageId } }] },
            'Sujet code': { rich_text: [{ text: { content: meta.code } }] },
            'Sujet titre': { rich_text: [{ text: { content: meta.titre || '' } }] },
            'Lu': { checkbox: false }
          }
        });
      } catch (e) { console.error('valider-sequencier notif (best-effort) : ' + (e && e.message || '')); }
    }
  } catch (e) { console.error('valider-sequencier signalement (best-effort) : ' + (e && e.message || '')); }
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

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('valider-sequencier indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }
  const action = String(body.action || '');
  const sujetCode = String(body.sujetCode || '').trim();
  if (action !== 'valider' && action !== 'corrections') return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };
  if (!sujetCode) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'sujetCode manquant' }) };

  // ── Identité : session client + contact relu LIVE (contactActif porte aussi la garde d'activation marque). ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const codeBrand = String(liv.codeBrand || '').trim();
  if (!CODE_BRAND_RE.test(codeBrand)) { console.error('valider-sequencier : code marque invalide'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  // ── Périmètre séquencier : le sujet doit être un projet Brand de SA marque (préfixe + ≥1 lettre). ──
  const reCode = new RegExp('^' + codeBrand + '[A-Za-z]+$'); // codeBrand est ^B\d+$ → aucun métacaractère
  if (!reCode.test(sujetCode)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };

  let sujet;
  try {
    const d = await notionFetch('/databases/' + DB_PROD + '/query', 'POST', token, { filter: { property: 'Code', rich_text: { equals: sujetCode } }, page_size: 1 });
    sujet = d.results && d.results[0];
  } catch (e) { console.error('valider-sequencier indispo (lecture sujet) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  if (!sujet) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };
  const pr = sujet.properties || {};
  if (_sel(pr, 'Format') !== 'Brand' || !reCode.test(_rt(pr, 'Code'))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };

  const meta = { pageId: sujet.id, code: _rt(pr, 'Code') || sujetCode, titre: _ti(pr, 'Titre') };

  // ── Garde d'échelon : « Validation Brand » DOIT être posée (le serveur impose ce que l'app impose déjà). ──
  if (!_cb(pr, 'Validation Brand')) {
    return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Le séquencier n\'est pas encore prêt pour validation.' }) };
  }

  // ── DEMANDER DES CORRECTIONS : simple message à l'équipe, AUCUN changement d'état (pas de terminal négatif). ──
  if (action === 'corrections') {
    const texte = String(body.texte || '').trim();
    if (!texte) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Décrivez les corrections souhaitées' }) };
    const msg = '✏️ Le client demande des corrections sur le séquencier — ' + meta.code + ' · ' + (meta.titre || '') + ' : ' + texte.slice(0, MAX_TEXTE);
    await signalerEquipe(pr, meta, 'validation', msg, liv.nom || '', token);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, corrections: true }) };
  }

  // ── VALIDER ──
  // Idempotent : déjà validé → succès sans réécrire ni re-notifier (anti double-fire / rechargement). Passe
  // AVANT la garde de statut : un projet validé est déjà En tournage (hors pré-tournage), c'est normal.
  if (_cb(pr, 'Validation Client')) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dejaValide: true }) };

  // Garde de statut : on ne valide PAS le séquencier d'un film déjà en production (Montage, etc.). Hors
  // pré-tournage → 409 FRANC, jamais un succès silencieux. (L'affichage « À valider » applique la même
  // borne via la même source PRE_TOURNAGE ; ceci est le filet serveur.)
  if (PRE_TOURNAGE.indexOf(_sel(pr, 'Statut')) === -1) {
    return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Ce séquencier ne peut plus être validé : le film est déjà en production.' }) };
  }

  // Écriture atomique : Validation Client:true + Statut 'En tournage' (pré-tournage confirmé → pas de régression).
  const props = { 'Validation Client': { checkbox: true }, 'Statut': { select: { name: 'En tournage' } } };
  try { await notionFetch('/pages/' + sujet.id, 'PATCH', token, { properties: props }); }
  catch (e) { console.error('valider-sequencier indispo (écriture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  // Notif équipe (best-effort), même texte que l'app équipe.
  await signalerEquipe(pr, meta, 'nouveau_sujet', '✅ Séquencier validé client — ' + meta.code + ' · ' + (meta.titre || '') + ' · Tournage peut démarrer !', liv.nom || '', token);

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, valide: true }) };
};
