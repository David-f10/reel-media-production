// netlify/functions/demande-client.js
// Lot A — circuit COURT : le client dépose une demande qui NE porte PAS sur un montage (décaler un tournage,
// autre). Écrit dans 📨 Demandes client (distincte de 📋 Retours). Portier CLIENT (verifier + contactActif),
// même doctrine que valider-sequencier-client : identité + marque estampillées SERVEUR, jamais le navigateur.
//   'creer'    → crée une demande (Statut 'Nouvelle'). ÉCRITURE → refusée sous emprunt ro (403).
//   'mes'      → liste les demandes DE CE contact (Statut + Réponse + id, clé du fil). Lecture (ro OK).
//   'fil'      → lit le fil d'une demande (message initial + 💬 Messages + repli « Réponse » héritée). Lecture (ro OK).
//   'message'  → poste un message client dans le fil. Sens='Client' estampillé serveur. ÉCRITURE (ro → 403).
//   'modifier' → édite le DERNIER message du fil s'il est du client et la demande non close. ÉCRITURE (ro → 403).
//   'clore'    → passe la demande à 'Clôturée' (« c'est réglé »). ÉCRITURE (ro → 403).
//   'rouvrir'  → Clôturée → 'En cours'. ÉCRITURE (ro → 403).
// Toutes les actions de fil sont BORNÉES AU CONTACT (on relit la page : parent == 📨 Demandes ET Contact client ==
// vt.id — pas « même marque » : le fil d'un collègue reste hors de portée). ⛔ Jamais le nom d'un membre dans le
// fil (équipe = « Réel Média » générique) ; ⛔ jamais un « Code acces » (la base n'en porte pas).
// « Nouveau film » NE VIT PAS ici (chaîne commerciale, base 🎬 Nouvelles missions) : Type est un select FERMÉ.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE, reSujetMarque } = require('./_perimetreclient'); // autorité unique du périmètre
const { appelNotion } = require('./_notionio');
const { signalerSlack } = require('./_slack'); // miroir Slack à sens unique (best-effort, jamais bloquant)
const { refDemande } = require('./_demref'); // référence d'affichage « D-<Code Brand>-<NN> » (helper PARTAGÉ avec demandes-admin)

const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const DB_MESSAGES = '41975d81-5951-81c7-b7f1-c2f2203ccd77'; // 💬 Messages — le fil (historique), rattaché par id de page COMPLET
const TYPES = ['Décaler un tournage', 'Autre']; // select FERMÉ — aligné sur Notion
const MAX_TEXTE = 2000;

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const _date = (pr, k) => (pr && pr[k] && pr[k].date && pr[k].date.start) || '';
const normId = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase(); // id de page sans tirets, minuscule
const EST_ID = (s) => /^[0-9a-f]{32}$/.test(normId(s)); // id de page Notion (32 hex, tirets tolérés)

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}
// Client Notion lié à la session (ro compris) : tout passe par _notionio.appelNotion → un emprunt ro ne peut écrire.
function creerNotionFetch(ro) {
  return async (pathApi, method, token, bodyObj) => {
    const r = await appelNotion(ro, pathApi, method, token, bodyObj);
    if (!r.ok) throw new Error(method + ' ' + pathApi.slice(0, 16) + ' ' + r.status);
    return r.json();
  };
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
  if (!token) { console.error('demande-client indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }
  const action = String(body.action || '');
  const ACTIONS = ['creer', 'mes', 'fil', 'message', 'modifier', 'clore', 'rouvrir'];
  if (ACTIONS.indexOf(action) === -1) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };

  // ── Identité : session client + contact relu LIVE (porte aussi la garde d'activation de la marque). ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const codeBrand = String(liv.codeBrand || '').trim();
  if (!CODE_BRAND_RE.test(codeBrand)) { console.error('demande-client : code marque invalide'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  const notionFetch = creerNotionFetch(vt.ro);

  // ── Bornage AU CONTACT (cœur de toutes les actions de fil) ──────────────────────────────────────────────────
  // Relit la demande et vérifie : parent == 📨 Demandes (jamais un id forgé vers une autre base) ET Contact client
  // == vt.id (le fil appartient à CE contact, pas à sa marque : un collègue n'y touche pas). Renvoie la page relue
  // (statut, message initial, Code Brand, Réponse héritée) ou un refus prêt à retourner.
  async function bornerDemande(demId) {
    if (!EST_ID(demId)) return { ok: false, status: 404, error: 'Demande introuvable' };
    let page;
    try { page = await notionFetch('/pages/' + demId, 'GET', token); }
    catch (e) {
      const m = (e && e.message || '').match(/\s(\d{3})$/);
      if (m && (m[1] === '404' || m[1] === '400')) return { ok: false, status: 404, error: 'Demande introuvable' };
      throw e; // panne réelle → 503 par le try/caller
    }
    if (!page || !page.parent || normId(page.parent.database_id) !== normId(DB_DEMANDES)) return { ok: false, status: 403, error: 'Accès refusé' };
    if (_rt(page.properties, 'Contact client') !== vt.id) return { ok: false, status: 403, error: 'Accès refusé' };
    return { ok: true, page };
  }
  // Lit toutes les lignes 💬 Messages d'une demande (rattachées par id COMPLET), triées par date croissante. Borné.
  async function lireFil(pageId) {
    const lignes = []; let cursor = null, pages = 0;
    do {
      const corps = { filter: { property: 'Réf demande', rich_text: { equals: pageId } }, sorts: [{ timestamp: 'created_time', direction: 'ascending' }], page_size: 100 };
      if (cursor) corps.start_cursor = cursor;
      const d = await notionFetch('/databases/' + DB_MESSAGES + '/query', 'POST', token, corps);
      (d.results || []).forEach(m => lignes.push(m));
      cursor = d.has_more ? d.next_cursor : null; pages++;
    } while (cursor && pages < 50);
    if (cursor) console.error('demande-client : fil TRONQUÉ (borne 50 pages / 5000 messages atteinte) pour ' + String(pageId).slice(0, 8));
    return lignes;
  }

  // ── FIL (lecture — autorisée sous ro) ──
  if (action === 'fil') {
    const b = await bornerDemande(String(body.demandeId || ''));
    if (!b.ok) return { statusCode: b.status, headers, body: JSON.stringify({ ok: false, error: b.error }) };
    const page = b.page;
    try {
      const lignes = await lireFil(page.id);
      const EQUIPE = 'Réel Média';
      // Message INITIAL : il VIT dans 📨 Demandes.Message (autorité unique, option iii) ; le fil le PRÉFIXE, il n'est
      // jamais dupliqué dans 💬 Messages. Toujours du client, daté de la page.
      const fil = [{
        sens: 'Client', auteur: 'Vous', texte: _ti(page.properties, 'Message'),
        date: page.created_time, modifieLe: '', mien: true, initial: true
      }];
      // Lignes du fil : messages suivants (client) et réponses (équipe). ⛔ auteur équipe = « Réel Média » générique
      // (jamais le nom d'un membre) ; les messages du client s'affichent « Vous ».
      let aReponseEquipe = false;
      lignes.forEach(m => {
        const sens = _sel(m.properties, 'Sens') === 'Réel Média' ? 'Réel Média' : 'Client';
        if (sens === 'Réel Média') aReponseEquipe = true;
        fil.push({
          sens, auteur: sens === 'Réel Média' ? EQUIPE : 'Vous', texte: _ti(m.properties, 'Message'),
          date: m.created_time, modifieLe: _date(m.properties, 'Modifié le'), mien: sens === 'Client'
        });
      });
      // REPLI de la « Réponse » héritée — SI ET SEULEMENT SI aucune ligne « Réel Média » dans le fil ET « Réponse »
      // non vide (assurance pour une demande répondue AVANT le merge de PR-1 ; la double-écriture couvre la suite).
      const reponseHeritee = _rt(page.properties, 'Réponse');
      if (!aReponseEquipe && reponseHeritee) {
        fil.push({ sens: 'Réel Média', auteur: EQUIPE, texte: reponseHeritee, date: page.last_edited_time || page.created_time, modifieLe: '', mien: false, herite: true });
      }
      const statut = _sel(page.properties, 'Statut') || 'Nouvelle';
      const dernier = fil[fil.length - 1];
      const enAttente = !!(dernier && dernier.sens === 'Client' && statut !== 'Clôturée'); // dérivé : qui attend qui
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, statut, fil, delai: { enAttente, depuis: enAttente ? dernier.date : '' } }) };
      // ⛔ aucun id de page brut dans le fil, ⛔ aucun contenu d'un autre contact (bornage), ⛔ aucun « Code acces »
    } catch (e) { console.error('demande-client indispo (fil) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  }

  // ── MESSAGE (écriture — refusée sous emprunt ro) ──
  if (action === 'message') {
    if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
    const texte = String(body.texte || '').trim();
    if (!texte) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Message vide' }) };
    if (texte.length > MAX_TEXTE) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Message trop long' }) };
    const b = await bornerDemande(String(body.demandeId || ''));
    if (!b.ok) return { statusCode: b.status, headers, body: JSON.stringify({ ok: false, error: b.error }) };
    if ((_sel(b.page.properties, 'Statut') || 'Nouvelle') === 'Clôturée') return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Demande clôturée — rouvrez-la pour écrire' }) };
    try {
      await notionFetch('/pages', 'POST', token, {
        parent: { database_id: DB_MESSAGES },
        properties: {
          'Message': { title: [{ text: { content: texte } }] },
          'Réf demande': { rich_text: [{ text: { content: b.page.id } }] }, // id COMPLET relu (clé du fil)
          'Sens': { select: { name: 'Client' } },                           // estampillé SERVEUR (le corps client est ignoré)
          'Auteur': { rich_text: [{ text: { content: liv.nom || '' } }] },   // le client se verra « Vous » ; stocké pour l'équipe
          'Code Brand': { rich_text: [{ text: { content: codeBrand } }] }    // ← serveur
        }
      });
      await signalerSlack({ marque: liv.marque, type: 'nouveau message' }); // best-effort, APRÈS l'écriture, jamais le texte
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      if (e && e.lectureSeule) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
      console.error('demande-client indispo (message) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    }
  }

  // ── MODIFIER le dernier message du fil (écriture — refusée sous emprunt ro) ──
  if (action === 'modifier') {
    if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
    const texte = String(body.texte || '').trim();
    if (!texte) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Message vide' }) };
    if (texte.length > MAX_TEXTE) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Message trop long' }) };
    const b = await bornerDemande(String(body.demandeId || ''));
    if (!b.ok) return { statusCode: b.status, headers, body: JSON.stringify({ ok: false, error: b.error }) };
    // CONDITION 5 : demande pas Clôturée (figée).
    if ((_sel(b.page.properties, 'Statut') || 'Nouvelle') === 'Clôturée') return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Demande clôturée — rien n\'est modifiable' }) };
    try {
      const lignes = await lireFil(b.page.id);
      const dernierMsg = lignes.length ? lignes[lignes.length - 1] : null;
      if (!dernierMsg) {
        // Aucune ligne de fil → le DERNIER message est l'INITIAL (📨 Demandes.Message). MAIS une « Réponse » héritée
        // (demande répondue AVANT PR-1) s'affiche comme un message équipe SOUS la question (cf. repli dans 'fil') :
        // rééditer la question reviendrait alors à la modifier « sous » une réponse — ce que la règle interdit
        // (condition 4). On ne l'édite donc QUE si aucune réponse n'existe (ni ligne fil — vérifié — ni héritée).
        if (_rt(b.page.properties, 'Réponse')) {
          return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Le dernier message n\'est pas le vôtre' }) };
        }
        await notionFetch('/pages/' + b.page.id, 'PATCH', token, { properties: { 'Message': { title: [{ text: { content: texte } }] } } });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      // CONDITIONS 1 & 4 (même fait : « c'est le dernier » ⇔ « aucune réponse en dessous ») : on ne vise QUE la
      // dernière ligne. CONDITION 2 : son Sens doit être 'Client' — si c'est une réponse de l'équipe, elle EST « en
      // dessous » du dernier message du client → refus. CONDITION 3 (écrit par CE contact) : garantie par le bornage
      // (aucune ligne de ce fil n'a pu être écrite par un autre contact).
      if (_sel(dernierMsg.properties, 'Sens') !== 'Client') {
        return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Le dernier message n\'est pas le vôtre' }) };
      }
      await notionFetch('/pages/' + dernierMsg.id, 'PATCH', token, {
        properties: { 'Message': { title: [{ text: { content: texte } }] }, 'Modifié le': { date: { start: new Date().toISOString() } } } // created_time inchangé
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      if (e && e.lectureSeule) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
      console.error('demande-client indispo (modifier) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    }
  }

  // ── CLORE / ROUVRIR (écriture — refusée sous emprunt ro) ──
  if (action === 'clore' || action === 'rouvrir') {
    if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
    const b = await bornerDemande(String(body.demandeId || ''));
    if (!b.ok) return { statusCode: b.status, headers, body: JSON.stringify({ ok: false, error: b.error }) };
    const statut = _sel(b.page.properties, 'Statut') || 'Nouvelle';
    if (action === 'clore' && statut === 'Clôturée') return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Demande déjà clôturée' }) };
    if (action === 'rouvrir' && statut !== 'Clôturée') return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'La demande n\'est pas clôturée' }) };
    const cible = action === 'clore' ? 'Clôturée' : 'En cours'; // rouvrir → En cours (comme la maquette)
    try {
      await notionFetch('/pages/' + b.page.id, 'PATCH', token, { properties: { 'Statut': { select: { name: cible } } } });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      if (e && e.lectureSeule) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
      console.error('demande-client indispo (' + action + ') : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
    }
  }

  // ── MES DEMANDES (lecture — autorisée sous ro) ──
  if (action === 'mes') {
    try {
      // Pagination RÉELLE : sans curseur, au-delà d'une page les demandes les plus anciennes du contact
      // disparaissaient en silence (une demande non lue se croit perdue). Boucle bornée à 20 pages (2000
      // demandes pour un seul contact) comme adminClients / demandes-admin.
      const resultats = [];
      let cursor = null, pages = 0;
      do {
        const corps = {
          filter: { property: 'Contact client', rich_text: { equals: vt.id } },
          sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 100
        };
        if (cursor) corps.start_cursor = cursor;
        const d = await notionFetch('/databases/' + DB_DEMANDES + '/query', 'POST', token, corps);
        resultats.push(...(d.results || []));
        cursor = d.has_more ? d.next_cursor : null; pages++;
      } while (cursor && pages < 20);
      // RANG dérivé par marque (PR-B). L'AFFICHAGE reste filtré sur le contact (boucle ci-dessus) : aucune
      // demande ne disparaît, même si la marque du contact a changé et que ses anciennes demandes portent un
      // Code Brand gelé. Pour NUMÉROTER, on lit l'ensemble de CHAQUE Code Brand distinct présent chez le contact
      // (normalement un seul) et on classe par id croissant. ⛔ On ne lit que les IDS des collègues (jamais leur
      // contenu) et on n'émet QUE les lignes du contact (ci-dessous).
      const rangParId = {};
      const marques = [];
      resultats.forEach(p => { const cb = _rt(p.properties, 'Code Brand'); if (cb && marques.indexOf(cb) === -1) marques.push(cb); });
      // ⚠ INVARIANT : demande-client et demandes-admin DOIVENT classer sur le MÊME ensemble pour composer la
      //    même réf. Ici 50 pages PAR MARQUE ; côté équipe 20 pages sur TOUTE la base, en tri created_time DESC.
      //    Si la base dépasse 2000, l'équipe perd les plus ANCIENNES (rangs 01, 02…) et les numéros divergent,
      //    justes ici, décalés là-bas. Ces deux bornes (et le tri côté équipe) doivent rester cohérentes —
      //    à relever ENSEMBLE, jamais l'une sans l'autre.
      for (const cb of marques) {
        const ids = [];
        let cur = null, pg = 0;
        do {
          const corps2 = { filter: { property: 'Code Brand', rich_text: { equals: cb } }, page_size: 100 };
          if (cur) corps2.start_cursor = cur;
          const dd = await notionFetch('/databases/' + DB_DEMANDES + '/query', 'POST', token, corps2);
          (dd.results || []).forEach(q => ids.push(normId(q.id))); // ⛔ uniquement l'id, jamais les propriétés
          cur = dd.has_more ? dd.next_cursor : null; pg++;
        } while (cur && pg < 50);
        if (cur) console.error('demande-client : classement de la marque ' + cb + ' TRONQUÉ (borne 50 pages atteinte) — rangs susceptibles de diverger de demandes-admin ; relever les deux bornes ENSEMBLE.');
        ids.sort(); // id de page croissant = ordre chronologique (ids Notion ordonnés dans le temps)
        ids.forEach((id, i) => { rangParId[id] = i + 1; });
      }
      const demandes = resultats.map(p => ({
        id: p.id,                                   // CLÉ DU FIL (lot 2) : le client la renvoie à 'fil'/'message'/… ;
                                                    //   inoffensive car CHAQUE action est bornée au contact (Contact
                                                    //   client == vt.id → un id d'un autre contact donne 403).
        ref: refDemande(_rt(p.properties, 'Code Brand'), rangParId[normId(p.id)] || 0), // « D-<Code Brand>-<NN> », rang dérivé
        message: _ti(p.properties, 'Message'),
        type: _sel(p.properties, 'Type'),
        statut: _sel(p.properties, 'Statut') || 'Nouvelle',
        reponse: _rt(p.properties, 'Réponse'),
        traitePar: _rt(p.properties, 'Traité par'),  // signe la réponse côté client (nom de membre, pas un secret)
        codeCarte: _rt(p.properties, 'Code carte'),
        date: p.created_time
        // ⛔ jamais de code d'accès (la base n'en porte pas)
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, demandes }) };
    } catch (e) { console.error('demande-client indispo (mes) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  }

  // ── CRÉER (écriture — refusée sous emprunt ro) ──
  if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };

  const type = String(body.type || '').trim();
  if (TYPES.indexOf(type) === -1) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Type de demande invalide' }) };
  const message = String(body.message || '').trim();
  if (!message) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Votre demande est vide' }) };
  if (message.length > MAX_TEXTE) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Demande trop longue' }) };

  // Code carte FACULTATIF : s'il est fourni, il DOIT appartenir au périmètre de la marque (autorité unique).
  const codeCarte = String(body.codeCarte || '').trim();
  if (codeCarte && !reSujetMarque(codeBrand).test(codeCarte)) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Mission hors de votre périmètre' }) };
  }

  const props = {
    'Message': { title: [{ text: { content: message } }] },
    'Type': { select: { name: type } },
    'Statut': { select: { name: 'Nouvelle' } },
    'Code Brand': { rich_text: [{ text: { content: codeBrand } }] },          // ← serveur
    'Demandeur': { rich_text: [{ text: { content: liv.nom || '' } }] },       // ← fiche contact, live
    'Contact client': { rich_text: [{ text: { content: vt.id } }] }           // ← id de page du contact, serveur
  };
  if (codeCarte) props['Code carte'] = { rich_text: [{ text: { content: codeCarte } }] };

  try {
    await notionFetch('/pages', 'POST', token, { parent: { database_id: DB_DEMANDES }, properties: props });
    // Miroir Slack à sens unique, APRÈS l'écriture primaire : best-effort, ne lance jamais, ne peut pas faire
    // échouer le dépôt. Nom de marque + libellé + lien HAVANA seulement — jamais le texte du client.
    await signalerSlack({ marque: liv.marque, type: 'nouvelle demande' });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    if (e && e.lectureSeule) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
    console.error('demande-client indispo (creer) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
