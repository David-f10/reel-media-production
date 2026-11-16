// netlify/functions/demande-client.js
// Lot A — circuit COURT : le client dépose une demande qui NE porte PAS sur un montage (décaler un tournage,
// autre). Écrit dans 📨 Demandes client (distincte de 📋 Retours). Portier CLIENT (verifier + contactActif),
// même doctrine que valider-sequencier-client : identité + marque estampillées SERVEUR, jamais le navigateur.
//   'creer' → crée une demande (Statut 'Nouvelle'). ÉCRITURE → refusée sous emprunt ro (403).
//   'mes'   → liste les demandes DE CE contact (Statut + Réponse), pour le retour d'état dans l'espace. Lecture.
// ⛔ Ne lit ni n'écrit JAMAIS un « Code acces » : cette base n'en porte pas, et on n'en fabrique pas.
// « Nouveau film » NE VIT PAS ici (chaîne commerciale, base 🎬 Nouvelles missions) : Type est un select FERMÉ.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE, reSujetMarque } = require('./_perimetreclient'); // autorité unique du périmètre
const { appelNotion } = require('./_notionio');
const { signalerSlack } = require('./_slack'); // miroir Slack à sens unique (best-effort, jamais bloquant)
const { refDemande } = require('./_demref'); // référence d'affichage « D-xxxxxxxx » (helper PARTAGÉ avec demandes-admin)

const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const TYPES = ['Décaler un tournage', 'Autre']; // select FERMÉ — aligné sur Notion
const MAX_TEXTE = 2000;

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const normId = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase(); // id de page sans tirets, minuscule

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
  if (action !== 'creer' && action !== 'mes') return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };

  // ── Identité : session client + contact relu LIVE (porte aussi la garde d'activation de la marque). ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const codeBrand = String(liv.codeBrand || '').trim();
  if (!CODE_BRAND_RE.test(codeBrand)) { console.error('demande-client : code marque invalide'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  const notionFetch = creerNotionFetch(vt.ro);

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
        ref: refDemande(_rt(p.properties, 'Code Brand'), rangParId[normId(p.id)] || 0), // « D-<Code Brand>-<NN> », rang dérivé
        message: _ti(p.properties, 'Message'),
        type: _sel(p.properties, 'Type'),
        statut: _sel(p.properties, 'Statut') || 'Nouvelle',
        reponse: _rt(p.properties, 'Réponse'),
        traitePar: _rt(p.properties, 'Traité par'),  // signe la réponse côté client (nom de membre, pas un secret)
        codeCarte: _rt(p.properties, 'Code carte'),
        date: p.created_time
        // ⛔ jamais de code d'accès (la base n'en porte pas) ; ⛔ jamais l'id de page brut (seule la référence sort)
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
