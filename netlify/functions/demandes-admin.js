// netlify/functions/demandes-admin.js
// Lot A — file ÉQUIPE des demandes courtes (📨 Demandes client), traitée depuis HAVANA. Authentifiée comme
// access-set/clients-admin : membre vérifié (verifyUser) ET porteur du droit CLIENT « Peut gérer les clients »
// (Brand + chefs). ⛔ Ne lit ni ne renvoie JAMAIS un « Code acces » (la base n'en porte pas).
//   'liste'  → toutes les demandes (tri Nouvelle d'abord, puis récentes). La pastille compte les Nouvelle.
//   'statut' → change le Statut (+ Réponse visible client, + Traité par). Écriture bornée À LA base Demandes
//              (on relit la page et on vérifie son parent avant tout PATCH : jamais un id forgé vers une autre base).

const { verifyUser } = require('./_auth');
const { appelNotion } = require('./_notionio');

const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const STATUTS = ['Nouvelle', 'En cours', 'Traitée', 'Refusée'];
const MAX_REPONSE = 2000;
const EST_ID = (s) => /^[0-9a-f]{32}$/.test(String(s || '').replace(/-/g, '').toLowerCase());
const normId = (s) => String(s || '').replace(/-/g, '').toLowerCase();

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const ORDRE = { 'Nouvelle': 0, 'En cours': 1, 'Traitée': 2, 'Refusée': 3 };

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('demandes-admin indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // Appelant : identifié ET porteur du droit CLIENT.
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || !auth.user || auth.user.peutGererClients !== true) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires des clients' }) };
  }

  const nf = async (chemin, methode, bodyObj) => appelNotion(false, chemin, methode, token, bodyObj); // équipe, jamais ro

  const action = String(body.action || 'liste');

  if (action === 'statut') {
    const id = String(body.id || '').trim();
    if (!EST_ID(id)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'id manquant ou invalide' }) };
    const statut = String(body.statut || '').trim();
    if (STATUTS.indexOf(statut) === -1) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Statut invalide' }) };
    const reponse = String(body.reponse || '').slice(0, MAX_REPONSE);

    // Bornage : relire la page et vérifier qu'elle est bien dans 📨 Demandes client (jamais un id forgé ailleurs).
    let page;
    try { const r = await nf('/pages/' + id, 'GET'); if (r.status === 404) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Demande introuvable' }) }; if (!r.ok) throw new Error('GET ' + r.status); page = await r.json(); }
    catch (e) { console.error('demandes-admin indispo (lecture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
    if (!page.parent || normId(page.parent.database_id) !== normId(DB_DEMANDES)) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };
    }

    const props = { 'Statut': { select: { name: statut } }, 'Traité par': { rich_text: [{ text: { content: auth.user.nom || '' } }] } };
    if (body.reponse !== undefined) props['Réponse'] = { rich_text: reponse ? [{ text: { content: reponse } }] : [] };
    try { const r = await nf('/pages/' + id, 'PATCH', { properties: props }); if (!r.ok) throw new Error('PATCH ' + r.status); }
    catch (e) { console.error('demandes-admin indispo (écriture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // 'liste'
  try {
    const out = []; let cursor = null, pages = 0;
    do {
      const b = { page_size: 100, sorts: [{ timestamp: 'created_time', direction: 'descending' }] };
      if (cursor) b.start_cursor = cursor;
      const r = await nf('/databases/' + DB_DEMANDES + '/query', 'POST', b);
      if (!r.ok) throw new Error('query ' + r.status);
      const d = await r.json();
      out.push(...(d.results || []));
      cursor = d.has_more ? d.next_cursor : null; pages++;
    } while (cursor && pages < 20);
    const demandes = out.map(p => ({
      id: p.id,
      message: _ti(p.properties, 'Message'),
      type: _sel(p.properties, 'Type'),
      codeBrand: _rt(p.properties, 'Code Brand'),
      codeCarte: _rt(p.properties, 'Code carte'),
      demandeur: _rt(p.properties, 'Demandeur'),
      statut: _sel(p.properties, 'Statut') || 'Nouvelle',
      reponse: _rt(p.properties, 'Réponse'),
      traitePar: _rt(p.properties, 'Traité par'),
      date: p.created_time
      // ⛔ pas de code d'accès : jamais lu, jamais renvoyé.
    })).sort((a, b) => (ORDRE[a.statut] - ORDRE[b.statut]) || (a.date < b.date ? 1 : -1)); // Nouvelle d'abord, puis récentes
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, demandes }) };
  } catch (e) {
    console.error('demandes-admin indispo (liste) : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
