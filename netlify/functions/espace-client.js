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
//    vérifié). Validation (étape) = DÉRIVÉE : une version envoyée, pas validée, SANS retours envoyés (balle au client),
//    pas un statut. « Validation chef » est interne → rangé en Montage.
//  • Réalisé par = Journaliste, repli « Réel Média ».
//  • Interlocutrice = Contact Brand du projet le PLUS RÉCENT du client ; vide → bloc masqué (null).
//  • Collaboration ET tables (à relire / en cours / livrés) = projets EXPOSÉS (Visible espace client) —
//    ce que le client peut ouvrir ; comptes et tables restent cohérents.
//
// EXCEPTION CONSCIENTE — l'interlocutrice se lit HORS du périmètre exposé : sur le projet le plus récent
// de la marque, exposé OU NON. C'est délibéré, et ce n'est PAS une fuite : on n'en sort qu'un PRÉNOM
// (le Contact Brand), jamais un code ni un titre de projet non exposé. La raison : sans ça, un client à
// zéro projet visible (le cas NORMAL — 87/89 décochés) n'aurait aucune référente, et le premier accès
// — l'écran précis où il se fait son opinion — serait anonyme. Toutes les autres lectures restent bornées
// à l'exposé. Si un jour on sort autre chose que le prénom de ce projet, cette exception doit être revue.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE, PRE_TOURNAGE } = require('./_perimetreclient');

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
// « Séries accordées » = nombre d'allers-retours contractuels. Valeur ÉCRITE si présente, sinon défaut 5
// (ceinture pour les projets créés demain ; la valeur écrite prime toujours — un projet négocié à 3 affiche 3).
// ⚠️ AFFICHAGE SEULEMENT, JAMAIS une garde : on montre « tour N sur X » pour que le client arbitre lui-même
// ses demandes — on ne FERME JAMAIS « Envoyer mes retours » au Nᵉ tour. Fermer le bouton transformerait une
// conversation commerciale en refus technique ; le dépassement se gère avec le client, pas contre lui. Ne
// « complète » PAS ce helper avec un blocage.
const seriesAccordees = (pr) => { const n = pr && pr['Séries accordées'] && pr['Séries accordées'].number; return (typeof n === 'number' && n > 0) ? n : 5; };

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
//  (2) Validation : DÉRIVÉE — courante envoyée, pas validée, ET sans retours envoyés (balle au client).
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
      // « à relire » = une courante envoyée, non validée, sans retours envoyés (il n'a rien fait) ET PAS
      // LIVRÉE. Le « && !livre » ferme un trou indépendant du hook de validation PAD (#176) : le statut peut
      // passer à PAD DIRECTEMENT dans Notion (l'équipe le fait couramment), sans déclencher le hook qui pose
      // « Date validation client ». Un tel projet serait alors livré ET non-validé → il apparaîtrait à la fois
      // dans Livrés et dans « À relire » (le client voit son film livré, et juste au-dessus une invitation à
      // le commenter). En excluant les livrés d'« À relire », l'espace est cohérent quelle que soit la façon
      // dont le statut a changé (app, Notion, rattrapage). Le hook reste utile — il pose la date, donc la vue
      // montage affiche « validée » au lieu de rester muette — mais la justesse de l'espace n'en dépend plus.
      const estARelire = !!courante && !valideeClient && !retoursEnvoyes && !livre;
      // Balle au client (→ étape Validation) UNIQUEMENT si la courante est envoyée, pas validée, ET sans
      // retours envoyés. Tour clos (retours envoyés) → l'étape retombe sur le statut interne (Montage) :
      // « vous avez parlé, on retravaille », pas « on vous attend » (correctif du mensonge observé sur B33D).
      const enAttenteClient = !!courante && !valideeClient && !retoursEnvoyes;

      if (livre) {
        const dd = dstart(pr, 'Date de diffusion');
        if (dd && (!plusAncienneDiffusion || dd < plusAncienneDiffusion)) plusAncienneDiffusion = dd;
        // rang = rang client de la DERNIÈRE version envoyée (= vsClient.length, l'ordre par Date envoi
        // client). Sert au bouton « Télécharger » du tableau Livrés : drive-download-client résout par
        // { sujetCode, rang }, aucun fileId ne descend. null si aucune version envoyée → pas de bouton
        // (même logique que aMontage : pas de lien vers un fichier qui n'existe pas pour le client).
        livres.push({ code, titre, sousFormat: sel(pr, 'Sous-format'), duree: rt(pr, 'Durée'), realisePar: realisePar(pr), dateDiffusion: dd, rang: vsClient.length || null, lienSeq: (pr['Lien sequencier'] && pr['Lien sequencier'].url) || '' });
      } else {
        const etape = etapeClient(pr, enAttenteClient);
        // aMontage : y a-t-il un montage à (re)voir depuis la ligne En cours ? Une version client existe
        // ET le projet n'est PAS déjà dans À relire (sinon deux boutons pour le même film, et « Revoir »
        // mentirait pour une version jamais vue). Par construction, UN seul point d'entrée par film :
        // à relire → lien dans À relire ; tour clos/validé → lien dans En cours ; tournage → aucun lien.
        // (Validé mais pas livré : estARelire faux → aMontage vrai → il peut revenir sur le film validé.)
        enCours.push({ code, titre, realisePar: realisePar(pr), etape, pastille: pastille(pr, auj), aMontage: !!courante && !estARelire, lienSeq: (pr['Lien sequencier'] && pr['Lien sequencier'].url) || '' });
      }
      if (estARelire) aRelire.push({ code, titre, numero: vsClient.length, seriesAccordees: seriesAccordees(pr), dateDeposee: dstart(courante.properties, 'Date envoi client') });
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

    // ── À VALIDER (séquencier) — requête SÉPARÉE, volontairement NON gardée par « Visible espace client ».
    //    Le séquencier se valide AVANT tout montage : ces projets ne sont pas encore Visible (Visible = envoi
    //    d'un montage). Le signal « prêt pour le client » du séquencier est « Validation Brand » posée ET
    //    « Validation Client » pas encore. On expose seulement code/titre/lien séquencier — aucune version.
    //    Filtres STABLES (préfixe Code + Brand + 2 checkbox), jamais de select dynamique. Échec → le catch
    //    rend 503 (Réserve 2), jamais un bloc vide. (valider-sequencier-client re-vérifie tout côté serveur.) ──
    const brutAValider = await queryTout(DB_PROD, { and: [
      { property: 'Code', rich_text: { starts_with: codeBrand } },
      { property: 'Format', select: { equals: 'Brand' } },
      { property: 'Validation Brand', checkbox: { equals: true } },
      { property: 'Validation Client', checkbox: { equals: false } }
    ] }, token);
    const aValider = brutAValider
      // Re-filtre de SORTIE (défense en profondeur, comme le re-check Visible des exposés) : préfixe + ≥1
      // lettre, ET on re-vérifie les deux checkbox côté serveur même si le filtre Notion les a déjà posées.
      .filter(p => reCode.test(rt(p.properties, 'Code')) && sel(p.properties, 'Format') === 'Brand' && cb(p.properties, 'Validation Brand') && !cb(p.properties, 'Validation Client') && PRE_TOURNAGE.indexOf(sel(p.properties, 'Statut')) !== -1)
      .map(p => ({ code: rt(p.properties, 'Code'), titre: ti(p.properties, 'Titre'), lienSeq: (p.properties['Lien sequencier'] && p.properties['Lien sequencier'].url) || '' }));

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        marque: liv.marque || '',
        interlocutrice,                                 // { nom } | null
        collaboration: { livres: livres.length, enCours: enCours.length, depuis: plusAncienneDiffusion ? moisFr(plusAncienneDiffusion) : null },
        aValider,                                       // [{ code, titre, lienSeq }] — séquencier à valider (Validation Brand posée, Client non)
        aRelire,                                        // [{ code, titre, numero, dateDeposee }]
        enCours,                                        // [{ code, titre, realisePar, etape 0..2, pastille|null }]
        livres                                          // [{ code, titre, sousFormat, duree, realisePar, dateDiffusion }]
      })
    };
  } catch (e) {
    // Réserve 2 : tout échec de calcul → 503 distinct, JAMAIS des blocs vides ni un premier accès menteur.
    console.error('espace-client indispo : ' + (e && e.message || ''));
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
