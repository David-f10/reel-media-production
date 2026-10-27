// netlify/functions/espace-client.js
// Lot G tranche 2 — « Mon espace » : UN endpoint « accueil » qui calcule les cinq blocs, servi par la
// SESSION du client (x-rmc-token). N'utilise PAS le proxy équipe. CORS restreint (F4), comme projets-client.
//
// UN seul appel peint tout l'accueil (anti-cascade). Réserve 2 : tout échec de calcul → 503 (jamais des
// blocs vides ni un premier accès menteur) ; un VRAI vide (le quotidien : 87/89 projets Brand décochés)
// descend en listes vides, et le front distingue « premier accès » (ok && tout vide) de « indisponible »
// (ok=false). Aucun statut interne, aucun numéro interne, aucun id de page ne descend (spec §8).
//
// DÉCISIONS (arbitrages de David, gelés) :
//  • 4 étapes sur l'axe CLIENT, pas interne. Traduction CÔTÉ SERVEUR (confidentialité) — voir etapeClient.
//  • Livré = Statut 'PAD' OU Date de diffusion PASSÉE. JAMAIS 'Diffusé' (0 occurrence sur 526 sujets,
//    vérifié). Validation (étape) = DÉRIVÉE : une version envoyée sans validation client (balle au client),
//    pas un statut. « Validation chef » est interne → rangé en Montage.
//  • Réalisé par = Journaliste, repli « Réel Média ».
//  • Interlocutrice = Contact Brand du projet le PLUS RÉCENT du client ; vide → bloc masqué (null).
//  • Collaboration ET tables (à relire / en cours / livrés) = projets EXPOSÉS (Visible espace client) —
//    ce que le client peut ouvrir ; comptes et tables restent cohérents. L'interlocutrice, elle, se lit
//    sur le projet le plus récent de la marque (exposé ou non) pour exister même à zéro projet visible.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE } = require('./_perimetreclient');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DB_VERSIONS = '3793eebb-2aeb-4d49-84ae-06d79cfb2704';
const DB_RETOURS = '02880609-ee82-4acc-b239-d8aac9cae439';
const BUDGET_MS = 7000;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Traduction statut interne → étape CLIENT (hors cas dérivés). Axe client : où est le film POUR LUI.
const ETAPE_PAR_STATUT = {
  'Brief / Idée': 0, 'Séquencier en cours': 0, 'Séquencier validé': 0, 'En tournage': 0, // Tournage
  'Post-prod': 1, 'Montage': 1, 'Retours': 1, 'Validation chef': 1                         // Montage (tout l'interne)
};

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}

const rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const cb = (pr, k) => !!(pr && pr[k] && pr[k].checkbox);
const dstart = (pr, k) => (pr && pr[k] && pr[k].date && pr[k].date.start) || '';

async function query(dbId, body, token) {
  const r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error('query ' + String(dbId).slice(0, 4) + ' ' + r.status);
  return r.json();
}
// Pagination bornée (garde-fou 20 pages) sur un filtre donné.
async function queryTout(dbId, filtre, token, sorts) {
  const out = [];
  let cursor = null, pages = 0;
  do {
    const b = { page_size: 100 }; if (filtre) b.filter = filtre; if (sorts) b.sorts = sorts;
    if (cursor) b.start_cursor = cursor;
    const d = await query(dbId, b, token);
    out.push(...(d.results || []));
    cursor = d.has_more ? d.next_cursor : null; pages++;
  } while (cursor && pages < 20);
  return out;
}

const AUJOURDHUI = () => new Date().toISOString().slice(0, 10);
const jjmmFr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (parseInt(m[3], 10) + ' ' + MOIS[parseInt(m[2], 10) - 1] + ' ' + m[1]) : ''; };
const moisFr = (iso) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? (MOIS[parseInt(m[2], 10) - 1] + ' ' + m[1]) : ''; };
const estLivre = (pr, auj) => sel(pr, 'Statut') === 'PAD' || (dstart(pr, 'Date de diffusion') && dstart(pr, 'Date de diffusion') < auj);
const realisePar = (pr) => sel(pr, 'Journaliste') || 'Réel Média';

// Étape CLIENT (0..2) d'un projet EN COURS (non livré). En-cours ne touche JAMAIS Diffusion : PAD et date
// passée sont « livrés » (ailleurs). L'étape reflète l'état RÉEL, pas une date d'air programmée :
//  (2) Validation : DÉRIVÉE — une version envoyée au client et pas encore validée (balle au client).
//  (1) Montage : Post-prod, Montage, Retours, Validation chef (interne).
//  (0) Tournage : Brief/Idée, Séquencier*, En tournage (défaut sûr).
function etapeClient(pr, aVersionEnAttenteClient) {
  if (aVersionEnAttenteClient) return 2;
  return (ETAPE_PAR_STATUT[sel(pr, 'Statut')] === 1) ? 1 : 0;
}
// Pastille : la prochaine DATE fiable (indépendante de l'étape ; jamais une promesse molle). Date de
// diffusion future prioritaire (le film est programmé), sinon date de tournage future, sinon null.
function pastille(pr, auj) {
  const dd = dstart(pr, 'Date de diffusion');
  if (dd && dd >= auj) return { texte: 'Diffusion le ' + jjmmFr(dd), date: dd };
  const dt = dstart(pr, 'Date tournage J1');
  if (dt && dt >= auj) return { texte: 'Tournage le ' + jjmmFr(dt), date: dt };
  return null;
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
  if (!token) { console.error('espace-client indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  // ── Identité : jeton de session + contact relu LIVE (Actif + Code Brand courant). Réserve 2. ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const codeBrand = String(liv.codeBrand || '').trim();
  if (!CODE_BRAND_RE.test(codeBrand)) { console.error('espace-client : code marque invalide'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  const reCode = new RegExp('^' + codeBrand + '[A-Za-z]+$'); // code marque + ≥1 LETTRE (exclut B33 vs B330)
  const auj = AUJOURDHUI();

  try {
    // ── Projets EXPOSÉS de la marque (préfixe + Visible + Brand) + garde de sortie reCode (alignée sur
    //    _perimetreclient : mêmes champs stables, pas de select dynamique). Sert aux tables + aux comptes. ──
    const brutsExposes = await queryTout(DB_PROD, { and: [
      { property: 'Code', rich_text: { starts_with: codeBrand } },
      { property: 'Visible espace client', checkbox: { equals: true } },
      { property: 'Format', select: { equals: 'Brand' } }
    ] }, token);
    const exposes = brutsExposes.filter(p => reCode.test(rt(p.properties, 'Code')) && sel(p.properties, 'Statut') !== 'Annulée');

    // ── Versions client + retours client de TOUS les sujets exposés, en 2 requêtes bornées (OR sur les ids). ──
    const ids = exposes.map(p => p.id);
    let versionsParSujet = {}, retoursParSujet = {};
    if (ids.length) {
      const filtreIds = (prop) => ids.length === 1 ? { property: prop, rich_text: { equals: ids[0] } } : { or: ids.map(id => ({ property: prop, rich_text: { equals: id } })) };
      const vs = await queryTout(DB_VERSIONS, filtreIds('Sujet ID'), token);
      const rs = await queryTout(DB_RETOURS, filtreIds('Sujet ID'), token);
      vs.forEach(v => { const sid = rt(v.properties, 'Sujet ID'); (versionsParSujet[sid] = versionsParSujet[sid] || []).push(v); });
      rs.forEach(r => { const sid = rt(r.properties, 'Sujet ID'); (retoursParSujet[sid] = retoursParSujet[sid] || []).push(r); });
    }

    const aRelire = [], enCours = [], livres = [];
    let plusAncienneDiffusion = '';

    exposes.forEach(p => {
      const pr = p.properties;
      const code = rt(pr, 'Code'), titre = ti(pr, 'Titre');
      const livre = estLivre(pr, auj);

      // Versions ENVOYÉES au client (Date envoi client posée), triées par date → rang client = ordre.
      const vsClient = (versionsParSujet[p.id] || [])
        .filter(v => dstart(v.properties, 'Date envoi client'))
        .sort((a, b) => { const da = dstart(a.properties, 'Date envoi client'), db = dstart(b.properties, 'Date envoi client'); return da < db ? -1 : da > db ? 1 : (a.id < b.id ? -1 : 1); });
      const courante = vsClient.length ? vsClient[vsClient.length - 1] : null;
      // Version interne de la courante (DB_VERSIONS.Version = rich_text, cf. correctif #163).
      const vInterne = courante ? rt(courante.properties, 'Version') : '';
      const valideeClient = courante ? !!dstart(courante.properties, 'Date validation client') : false;
      // Le client a-t-il ENVOYÉ des retours en ligne sur la courante ? (tour clos)
      const retoursEnvoyes = courante ? (retoursParSujet[p.id] || []).some(r => sel(r.properties, 'Source') === 'Client' && cb(r.properties, 'Déposé en ligne') && !cb(r.properties, 'Brouillon') && sel(r.properties, 'Version') === vInterne) : false;
      // « à relire » = une courante envoyée, non validée, sans retours envoyés (il n'a rien fait).
      const estARelire = !!courante && !valideeClient && !retoursEnvoyes;
      // « balle au client » (pour l'étape Validation) = courante envoyée et pas encore validée.
      const enAttenteClient = !!courante && !valideeClient;

      if (livre) {
        const dd = dstart(pr, 'Date de diffusion');
        if (dd && (!plusAncienneDiffusion || dd < plusAncienneDiffusion)) plusAncienneDiffusion = dd;
        livres.push({ code, titre, sousFormat: sel(pr, 'Sous-format'), duree: rt(pr, 'Durée'), realisePar: realisePar(pr), dateDiffusion: dd });
      } else {
        const etape = etapeClient(pr, enAttenteClient);
        enCours.push({ code, titre, realisePar: realisePar(pr), etape, pastille: pastille(pr, auj) });
      }
      if (estARelire) aRelire.push({ code, titre, numero: vsClient.length, dateDeposee: dstart(courante.properties, 'Date envoi client') });
    });

    livres.sort((a, b) => (a.dateDiffusion < b.dateDiffusion ? 1 : a.dateDiffusion > b.dateDiffusion ? -1 : 0)); // plus récent d'abord

    // ── Interlocutrice : Contact Brand du projet le PLUS RÉCENT de la marque (exposé ou non), pour exister
    //    même à zéro projet visible (premier accès). Vide → null → bloc masqué (pas de ligne générique). ──
    let interlocutrice = null;
    const recents = await queryTout(DB_PROD, { and: [
      { property: 'Code', rich_text: { starts_with: codeBrand } },
      { property: 'Format', select: { equals: 'Brand' } }
    ] }, token, [{ timestamp: 'created_time', direction: 'descending' }]);
    const recent = recents.find(p => reCode.test(rt(p.properties, 'Code')));
    if (recent) { const nom = sel(recent.properties, 'Contact Brand'); if (nom) interlocutrice = { nom }; }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        marque: liv.marque || '',
        interlocutrice,                                 // { nom } | null
        collaboration: { livres: livres.length, enCours: enCours.length, depuis: plusAncienneDiffusion ? moisFr(plusAncienneDiffusion) : null },
        aRelire,                                        // [{ code, titre, numero, dateDeposee }]
        enCours,                                        // [{ code, titre, realisePar, etape 0..3, pastille|null }]
        livres                                          // [{ code, titre, sousFormat, duree, realisePar, dateDiffusion }]
      })
    };
  } catch (e) {
    // Réserve 2 : tout échec de calcul → 503 distinct, JAMAIS des blocs vides ni un premier accès menteur.
    console.error('espace-client indispo : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
