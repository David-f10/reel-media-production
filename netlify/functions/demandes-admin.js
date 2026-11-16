// netlify/functions/demandes-admin.js
// Lot A — file ÉQUIPE des demandes courtes (📨 Demandes client), traitée depuis HAVANA. Authentifiée comme
// access-set/clients-admin : membre vérifié (verifyUser) ET porteur du droit CLIENT « Peut gérer les clients »
// (Brand + chefs). ⛔ Ne lit ni ne renvoie JAMAIS un « Code acces » (la base n'en porte pas).
//   'liste'  → toutes les demandes (tri Nouvelle d'abord, puis récentes). La pastille compte les Nouvelle.
//   'statut' → change le Statut (+ Réponse visible client, + Traité par). Écriture bornée À LA base Demandes
//              (on relit la page et on vérifie son parent avant tout PATCH : jamais un id forgé vers une autre base).
//              DOUBLE-ÉCRITURE (lot 2) : l'historique vit désormais dans 💬 Messages (une ligne « Réel Média » par
//              réponse, jamais écrasée) ; « Réponse » reste écrite en plus, comme RÉSUMÉ « dernière réponse » que
//              relit l'écran équipe (index.html). Garde : on refuse de RÉTROGRADER une demande Clôturée vers Nouvelle
//              (une page restée ouverte dans un onglet ne doit pas annuler en silence la clôture du client).

const { verifyUser } = require('./_auth');
const { appelNotion } = require('./_notionio');
const { refDemande } = require('./_demref'); // MÊME référence d'affichage que côté client (helper partagé)

const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const DB_MESSAGES = '41975d81-5951-81c7-b7f1-c2f2203ccd77'; // 💬 Messages — le fil (historique) ; cf. double-écriture
const STATUTS = ['Nouvelle', 'En cours', 'Traitée', 'Refusée', 'Clôturée']; // Clôturée = statut CLIENT ; l'équipe ne le POSE pas mais DOIT pouvoir le resoumettre (sinon sa réponse à une demande close est rejetée en 400)
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

    // GARDE anti-rétrogradation : une demande actuellement Clôturée (par le client, « c'est réglé ») ne peut pas
    // retomber à « Nouvelle ». C'est le chemin NORMAL du bug : un onglet resté ouvert AVANT que Clôturée n'existe
    // dans le sélecteur voit la 1re option (Nouvelle) pré-sélectionnée et la renvoie en répondant → la clôture
    // serait annulée en silence. On conserve alors Clôturée (et la réponse est bien enregistrée malgré tout).
    // Clôturée→En cours/Traitée/Refusée reste permis : c'est un geste DÉLIBÉRÉ de l'équipe (pas un défaut d'onglet).
    const statutActuel = _sel(page.properties, 'Statut');
    let statutFinal = statut;
    if (statutActuel === 'Clôturée' && statut === 'Nouvelle') {
      statutFinal = 'Clôturée';
      console.error('demandes-admin : rétrogradation Clôturée→Nouvelle REFUSÉE (demande ' + id.slice(0, 8) + ') — clôture client préservée.');
    }

    const props = { 'Statut': { select: { name: statutFinal } }, 'Traité par': { rich_text: [{ text: { content: auth.user.nom || '' } }] } };
    if (body.reponse !== undefined) props['Réponse'] = { rich_text: reponse ? [{ text: { content: reponse } }] : [] };
    try { const r = await nf('/pages/' + id, 'PATCH', { properties: props }); if (!r.ok) throw new Error('PATCH ' + r.status); }
    catch (e) { console.error('demandes-admin indispo (écriture) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

    // Double-écriture : l'historique dans le fil. Best-effort APRÈS l'écriture primaire — un incident sur 💬 Messages
    // ne fait PAS échouer la réponse de l'équipe (déjà dans « Réponse »), et le repli 'fil' côté client réaffiche
    // « Réponse » tant qu'aucune ligne « Réel Média » n'existe : rien ne se perd. On n'écrit QUE s'il y a du texte.
    if (reponse) {
      try {
        const r = await nf('/pages', 'POST', {
          parent: { database_id: DB_MESSAGES },
          properties: {
            'Message': { title: [{ text: { content: reponse } }] },
            'Réf demande': { rich_text: [{ text: { content: page.id } }] },     // id de page COMPLET relu (clé du fil, exactement ce par quoi le client filtre), jamais « D-… »
            'Sens': { select: { name: 'Réel Média' } },                         // estampillé SERVEUR
            'Auteur': { rich_text: [{ text: { content: 'Réel Média' } }] },      // ⛔ générique : le nom du membre reste équipe-side (Traité par), jamais dans le fil
            'Code Brand': { rich_text: [{ text: { content: _rt(page.properties, 'Code Brand') } }] }
          }
        });
        if (!r.ok) throw new Error('POST ' + r.status);
      } catch (e) { console.error('demandes-admin : ligne 💬 Messages NON écrite (fil) : ' + (e && e.message || '') + ' — « Réponse » conservée, repli fil assuré.'); }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // 'liste'
  try {
    // ⚠ INVARIANT de numérotation : le rang D-<marque>-<NN> est le MÊME que celui de demande-client À CONDITION
    //    de classer sur le même ensemble. Ici on lit TOUTE la base, bornée 20 pages (2000) en tri created_time
    //    DESC → au-delà, les plus ANCIENNES tombent et les rangs se décalent CÔTÉ ÉQUIPE seulement (le client,
    //    lui, lit 50 pages PAR MARQUE). Ces bornes et ce tri doivent rester cohérents — à relever ENSEMBLE.
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
    if (cursor) console.error('demandes-admin : base TRONQUÉE au classement (borne 20 pages / 2000 atteinte, tri DESC → les plus anciennes tombent) — rangs D-<marque>-<NN> susceptibles de diverger du client ; relever les deux bornes ENSEMBLE.');
    // RANG par marque (MÊME dérivation que côté client) : grouper par Code Brand, trier par id croissant,
    // numéroter. Zéro requête de plus — 'liste' ramène déjà toute la base. Un demande donnée obtient donc le
    // MÊME « D-<Code Brand>-<NN> » que celui vu par le client (même ensemble, même tri).
    const parMarque = {};
    out.forEach(p => { const cb = _rt(p.properties, 'Code Brand'); if (cb) (parMarque[cb] = parMarque[cb] || []).push(normId(p.id)); });
    const rangParId = {};
    Object.keys(parMarque).forEach(cb => { parMarque[cb].sort().forEach((id, i) => { rangParId[id] = i + 1; }); });
    const demandes = out.map(p => ({
      id: p.id,
      ref: refDemande(_rt(p.properties, 'Code Brand'), rangParId[normId(p.id)] || 0), // MÊME étiquette « D-<Code Brand>-<NN> » que chez le client
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
