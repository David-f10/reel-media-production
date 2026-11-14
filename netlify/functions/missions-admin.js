// netlify/functions/missions-admin.js
// Étage 2b — file ÉQUIPE du TRIAGE COMMERCIAL des nouvelles missions (🎬 Nouvelles missions), depuis HAVANA.
// Authentifiée comme demandes-admin : membre vérifié (verifyUser) ET porteur du droit CLIENT « Peut gérer les
// clients » (les 8 : 5 Brand, Arnaud, Chloé, David). File PARTAGÉE — pas de référent par marque, pas de routage.
// ⛔ Ne lit ni ne renvoie JAMAIS un « Code acces » (la base n'en porte pas).
//   'liste'    → toutes les missions (tri Nouvelle d'abord, puis récentes). La pastille compte les Nouvelle.
//   'decision' → accepter | refuser, le SEUL geste de cet étage. Le client envoie un VERBE, jamais un statut
//                brut ; le serveur fixe la cible. Transition bornée Nouvelle → Acceptée|Refusée (jamais un
//                autre état, jamais une mission déjà traitée). Refuser EXIGE un motif (il part dans Réponse,
//                lu par le client). « Validé commercial par » = le nom du membre, estampillé serveur.
//                Accepter s'arrête là : la suite (devis) appartient à la compta (étage 2c). Écriture bornée À
//                LA base Missions (on relit la page et on vérifie son parent avant tout PATCH).

const { verifyUser } = require('./_auth');
const { appelNotion } = require('./_notionio');

const DB_MISSIONS = '41875d81-5951-81b6-a6aa-ff03bfbcfd49';
const MAX_MOTIF = 2000;
const EST_ID = (s) => /^[0-9a-f]{32}$/.test(String(s || '').replace(/-/g, '').toLowerCase());
const normId = (s) => String(s || '').replace(/-/g, '').toLowerCase();

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const _date = (pr, k) => (pr && pr[k] && pr[k].date && pr[k].date.start) || '';
// Tri d'affichage : la file commerciale regarde d'abord ce qu'elle doit traiter (Nouvelle), le reste suit.
const ORDRE = { 'Nouvelle': 0, 'Acceptée': 1, 'Devis': 2, 'Validée': 3, 'En production': 4, 'Refusée': 5 };

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
  if (!token) { console.error('missions-admin indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // Appelant : identifié ET porteur du droit CLIENT (les 8).
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || !auth.user || auth.user.peutGererClients !== true) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires des clients' }) };
  }

  const nf = async (chemin, methode, bodyObj) => appelNotion(false, chemin, methode, token, bodyObj); // équipe, jamais ro

  const action = String(body.action || 'liste');

  if (action === 'decision') {
    const id = String(body.id || '').trim();
    if (!EST_ID(id)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'id manquant ou invalide' }) };
    const decision = String(body.decision || '').trim();
    if (decision !== 'accepter' && decision !== 'refuser') return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Décision invalide' }) };
    const motif = String(body.motif || '').trim().slice(0, MAX_MOTIF);
    // Un refus sans motif n'a pas de sens : le client doit pouvoir lire POURQUOI.
    if (decision === 'refuser' && !motif) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Un refus doit porter un motif' }) };

    // Bornage : relire la page, vérifier qu'elle est bien dans 🎬 Nouvelles missions (jamais un id forgé ailleurs),
    // ET qu'elle est encore à 'Nouvelle' (cet étage ne touche QUE la transition commerciale — pas de re-décision,
    // pas de course entre deux membres de la file partagée).
    let page;
    try { const r = await nf('/pages/' + id, 'GET'); if (r.status === 404) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Mission introuvable' }) }; if (!r.ok) throw new Error('GET ' + r.status); page = await r.json(); }
    catch (e) { console.error('missions-admin indispo (lecture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
    if (!page.parent || normId(page.parent.database_id) !== normId(DB_MISSIONS)) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };
    }
    if (_sel(page.properties, 'Statut') !== 'Nouvelle') {
      return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Cette mission a déjà été traitée' }) };
    }

    const cible = decision === 'accepter' ? 'Acceptée' : 'Refusée';
    const props = {
      'Statut': { select: { name: cible } },
      'Validé commercial par': { rich_text: [{ text: { content: auth.user.nom || '' } }] } // ← serveur, jamais le navigateur
    };
    // Refus : le motif part dans Réponse (visible client). Acceptation : on n'écrit RIEN d'autre (la suite = compta).
    if (decision === 'refuser') props['Réponse'] = { rich_text: [{ text: { content: motif } }] };

    try { const r = await nf('/pages/' + id, 'PATCH', { properties: props }); if (!r.ok) throw new Error('PATCH ' + r.status); }
    catch (e) { console.error('missions-admin indispo (écriture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // 'liste'
  try {
    const out = []; let cursor = null, pages = 0;
    do {
      const b = { page_size: 100, sorts: [{ timestamp: 'created_time', direction: 'descending' }] };
      if (cursor) b.start_cursor = cursor;
      const r = await nf('/databases/' + DB_MISSIONS + '/query', 'POST', b);
      if (!r.ok) throw new Error('query ' + r.status);
      const d = await r.json();
      out.push(...(d.results || []));
      cursor = d.has_more ? d.next_cursor : null; pages++;
    } while (cursor && pages < 20);
    const missions = out.map(p => ({
      id: p.id,
      objet: _ti(p.properties, 'Objet'),
      statut: _sel(p.properties, 'Statut') || 'Nouvelle',
      plateforme: _sel(p.properties, 'Plateforme'),
      codeBrand: _rt(p.properties, 'Code Brand'),
      demandeur: _rt(p.properties, 'Demandeur'),
      lieu: _rt(p.properties, 'Lieu de tournage'),
      personnes: _rt(p.properties, 'Personnes à interviewer'),
      contactSurPlace: _rt(p.properties, 'Contact sur place'),
      pourQuand: _date(p.properties, 'Pour quand'),
      reponse: _rt(p.properties, 'Réponse'),
      carteCreee: _rt(p.properties, 'Carte créée'),
      valideCommercialPar: _rt(p.properties, 'Validé commercial par'),
      date: p.created_time
      // ⛔ pas de code d'accès : jamais lu, jamais renvoyé.
    })).sort((a, b) => (ORDRE[a.statut] - ORDRE[b.statut]) || (a.date < b.date ? 1 : -1)); // Nouvelle d'abord, puis récentes
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, missions }) };
  } catch (e) {
    console.error('missions-admin indispo (liste) : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
