// netlify/functions/mission-client.js
// Étage 2a — la DEUXIÈME porte client : proposer un NOUVEAU film (une mission qui n'existe pas encore, pas une
// carte au contrat). Écrit dans 🎬 Nouvelles missions, Origine 'Espace client', Statut 'Nouvelle'. Voisine de
// demande-client (#240, 📨 Demandes client, questions courtes) : même portier CLIENT, même doctrine serveur.
//   'creer' → crée une mission. ÉCRITURE → refusée sous emprunt ro (403).
//   'mes'   → liste les missions DE CE contact (Statut + Réponse + Carte créée), pour le retour d'état. Lecture.
// Un seul champ obligatoire : Objet. Tout le reste facultatif — « je ne sais pas encore » est la réponse NORMALE,
// jamais une erreur. Identité, marque, origine et statut sont estampillés SERVEUR, jamais le navigateur.
// ⛔ Ne lit ni n'écrit JAMAIS un « Code acces » : cette base n'en porte pas, et on n'en fabrique pas.
// On N'écrit PAS Réponse / Carte créée / Validé commercial par / Validé devis par : ça appartient aux étages 2b–2d.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE } = require('./_perimetreclient'); // autorité unique du périmètre (ici : sanity du Code Brand serveur)
const { appelNotion } = require('./_notionio');

const DB_MISSIONS = '41875d81-5951-81b6-a6aa-ff03bfbcfd49';
// select FERMÉ — aligné sur Notion (5 valeurs : David a ajouté « Interne » pour les films sans diffusion publique).
const PLATEFORMES = ['Instagram', 'TikTok', 'Facebook', 'YouTube', 'Interne'];
const MAX_OBJET = 2000;   // Objet porte la description du film (seul champ libre long)
const MAX_TEXTE = 500;    // adresse, contact sur place
const MAX_PERS = 1000;    // personnes à interviewer

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const _date = (pr, k) => (pr && pr[k] && pr[k].date && pr[k].date.start) || '';

// Date « Pour quand » FACULTATIVE : si fournie, une vraie date YYYY-MM-DD (sinon vide = « pas encore fixé »).
function dateValide(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

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
  if (!token) { console.error('mission-client indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

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
  if (!CODE_BRAND_RE.test(codeBrand)) { console.error('mission-client : code marque invalide'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  const notionFetch = creerNotionFetch(vt.ro);

  // ── MES MISSIONS (lecture — autorisée sous ro) ──
  if (action === 'mes') {
    try {
      const d = await notionFetch('/databases/' + DB_MISSIONS + '/query', 'POST', token, {
        filter: { property: 'Contact client', rich_text: { equals: vt.id } },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 50
      });
      const missions = (d.results || []).map(p => ({
        objet: _ti(p.properties, 'Objet'),
        statut: _sel(p.properties, 'Statut') || 'Nouvelle',
        plateforme: _sel(p.properties, 'Plateforme'),
        reponse: _rt(p.properties, 'Réponse'),       // mot de l'équipe, visible client (motif si refus)
        carteCreee: _rt(p.properties, 'Carte créée'), // code de la carte au bout (rempli En production)
        pourQuand: _date(p.properties, 'Pour quand'),
        date: p.created_time
        // ⛔ jamais de code d'accès (la base n'en porte pas)
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, missions }) };
    } catch (e) { console.error('mission-client indispo (mes) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  }

  // ── CRÉER (écriture — refusée sous emprunt ro) ──
  if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };

  // Seul champ obligatoire : l'objet.
  const objet = String(body.objet || '').trim();
  if (!objet) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Dites au moins de quoi parle le film' }) };
  if (objet.length > MAX_OBJET) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Description trop longue' }) };

  // Tout le reste est FACULTATIF. On ne valide que la forme de ce qui est fourni ; un champ vide n'est jamais une erreur.
  const plateforme = String(body.plateforme || '').trim();
  if (plateforme && PLATEFORMES.indexOf(plateforme) === -1) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Plateforme inconnue' }) };
  const lieu = String(body.lieu || '').trim().slice(0, MAX_TEXTE);           // VRAIE adresse (pas Studio/Extérieur)
  const personnes = String(body.personnes || '').trim().slice(0, MAX_PERS);  // souvent vide à la demande
  const contactSurPlace = String(body.contactSurPlace || '').trim().slice(0, MAX_TEXTE);
  const pourQuand = String(body.pourQuand || '').trim();
  if (pourQuand && !dateValide(pourQuand)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Date « pour quand » invalide' }) };

  const props = {
    'Objet': { title: [{ text: { content: objet } }] },
    'Origine': { select: { name: 'Espace client' } },                        // ← serveur
    'Statut': { select: { name: 'Nouvelle' } },                              // ← entrée flexible : Espace client entre à Nouvelle
    'Code Brand': { rich_text: [{ text: { content: codeBrand } }] },         // ← serveur (REQUIS)
    'Demandeur': { rich_text: [{ text: { content: liv.nom || '' } }] },      // ← fiche contact, live
    'Contact client': { rich_text: [{ text: { content: vt.id } }] }          // ← id de page du contact, serveur
  };
  if (plateforme) props['Plateforme'] = { select: { name: plateforme } };
  if (lieu) props['Lieu de tournage'] = { rich_text: [{ text: { content: lieu } }] };
  if (personnes) props['Personnes à interviewer'] = { rich_text: [{ text: { content: personnes } }] };
  if (contactSurPlace) props['Contact sur place'] = { rich_text: [{ text: { content: contactSurPlace } }] };
  if (pourQuand) props['Pour quand'] = { date: { start: pourQuand } };

  try {
    await notionFetch('/pages', 'POST', token, { parent: { database_id: DB_MISSIONS }, properties: props });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    if (e && e.lectureSeule) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };
    console.error('mission-client indispo (creer) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
