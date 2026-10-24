// netlify/functions/_perimetre.js
// Périmètre d'un membre EXTERNE (3/3b) : les sujets où son nom figure dans l'un des 5 champs, EXACTEMENT
// la définition que l'app utilise déjà (mesCartes, index.html) — Journaliste, Responsable montage,
// Monteur V1/V2/V3. Ne pas en inventer une autre.
//
// Deux usages :
//   • pageDansPerimetre(page, nom) — teste une page DB_PROD renvoyée (ses 5 propriétés select) : sert à
//     FILTRER la réponse d'une query DB_PROD, sans appel Notion supplémentaire.
//   • perimetreIds(nom, token)     — l'ensemble des ids de sujets du membre (cache 60 s/nom) : sert à
//     borner la cascade (retours/versions/commentaires/… filtrés par Sujet ID) et les écritures.

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const CHAMPS = ['Journaliste', 'Responsable montage', 'Monteur V1', 'Monteur V2', 'Monteur V3'];
const CACHE_TTL = 60 * 1000;
// Réessai 429 : plafond d'UNE attente (Retry-After INCLUS) et budget de temps par défaut si aucune
// échéance n'est fournie. notion.js passe l'échéance GLOBALE de l'invocation (défaut Netlify = 10 s) :
// une fonction tuée par timeout est pire qu'un 429 rendu vite.
const WAIT_CAP_MS = 4000;
const DEFAULT_BUDGET_MS = 6000;

// Notion traite un id AVEC ou SANS tirets comme la même page → on compare toujours normalisé.
const norm = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase();

// Un sujet (page DB_PROD) est-il dans le périmètre de `nom` ? Lecture des 5 propriétés select.
function pageDansPerimetre(page, nom) {
  const p = page && page.properties;
  if (!p || !nom) return false;
  return CHAMPS.some(c => (p[c] && p[c].select && p[c].select.name) === nom);
}

const _cache = new Map(); // nom → { ids: Set<normId>, ts }  — résultat caché 60 s
const _enVol = new Map(); // nom → Promise<Set<normId>>       — dédup des appels EN VOL

// La query paginée DB_PROD (or sur les 5 champs), avec RÉESSAI sur 429 UNIQUEMENT (rate-limit Notion).
// Toute autre erreur lève → l'appelant refuse (fail-closed). Respecte Retry-After si présent, sinon
// backoff exponentiel (au plus 4 réessais). Un 429 encore en échec après réessais lève aussi → 502.
async function _fetchPerimetre(nom, token, deadline) {
  const filter = { or: CHAMPS.map(c => ({ property: c, select: { equals: nom } })) };
  const ids = new Set();
  let cursor = null, pages = 0;
  do {
    const b = { filter, page_size: 100 };
    if (cursor) b.start_cursor = cursor;
    let r, tent = 0;
    for (;;) {
      r = await fetch('https://api.notion.com/v1/databases/' + DB_PROD + '/query', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      });
      if (r.status !== 429 || tent >= 4) break;        // réessai sur 429 SEULEMENT
      const ra = parseFloat(r.headers && r.headers.get && r.headers.get('retry-after'));
      // Plafond d'UNE attente appliqué AUSSI à Retry-After : Notion peut répondre un délai en dizaines
      // de secondes → non plafonné, la fonction serait tuée par timeout (pire qu'un 429 rendu vite).
      const attente = Math.min(WAIT_CAP_MS, ra > 0 ? ra * 1000 : 400 * Math.pow(2, tent));
      if (Date.now() + attente > deadline) break;      // budget GLOBAL (horloge murale) épuisé → on cesse, on lèvera
      await new Promise(res => setTimeout(res, attente));
      tent++;
    }
    if (!r.ok) { console.error('perimetre query ' + r.status + ' : ' + await r.text().catch(() => '')); throw new Error('perimetre query ' + r.status); } // 429 épuisé OU autre erreur → fail-closed (log du corps Notion pour diagnostic)
    const d = await r.json();
    (d.results || []).forEach(p => ids.add(norm(p.id)));
    cursor = d.has_more ? d.next_cursor : null;
    pages++;
  } while (cursor && pages < 20);
  return ids;
}

// Ensemble des ids (normalisés) des sujets de `nom`. Caché 60 s. À FROID, les appelants CONCURRENTS
// attendent LA MÊME promesse (une seule query DB_PROD pour toute la rafale) : c'est ça qui évite que
// l'ouverture d'une fiche par un externe tire N query périmètre en parallèle → 429 → 502. Lève en cas
// d'échec Notion (après réessais sur 429) → l'appelant DOIT refuser (fail-closed), jamais relayer ;
// l'échec n'est pas caché (l'entrée en vol est retirée), la prochaine tentative repart à neuf.
function perimetreIds(nom, token, deadline) {
  if (!nom) return Promise.resolve(new Set());
  const hit = _cache.get(nom);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL) return Promise.resolve(hit.ids);
  const enVol = _enVol.get(nom);
  if (enVol) return enVol;
  // `deadline` = échéance ABSOLUE (ms epoch) partagée avec le reste de l'invocation (notion.js la pose à
  // l'entrée du handler). Absente (appelant tiers) → repli sur un budget interne, pour ne jamais retomber
  // dans un réessai non borné. La rafale concurrente partage la MÊME promesse → l'échéance du 1er appelant.
  const dl = deadline || (Date.now() + DEFAULT_BUDGET_MS);
  const p = _fetchPerimetre(nom, token, dl)
    .then(ids => { _cache.set(nom, { ids, ts: Date.now() }); return ids; })
    .finally(() => { _enVol.delete(nom); });
  _enVol.set(nom, p);
  return p;
}

// 3/3b-2 : `nom` est-il sur le sujet de code `sujetCode` ? Une query DB_PROD ciblée
// {and:[ Code = sujetCode, or(5 champs = nom) ]} (2 niveaux, dans la limite Notion). Pas de cache
// (téléchargement rare, et on veut la vérité fraîche). Lève en cas d'échec → l'appelant refuse.
async function estSurSujetCode(nom, sujetCode, token) {
  if (!nom || !sujetCode) return false;
  const filter = { and: [
    { property: 'Code', rich_text: { equals: sujetCode } },
    { or: CHAMPS.map(c => ({ property: c, select: { equals: nom } })) }
  ]};
  const r = await fetch('https://api.notion.com/v1/databases/' + DB_PROD + '/query', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter, page_size: 1 })
  });
  if (!r.ok) throw new Error('perimetre sujet ' + r.status);
  const d = await r.json();
  return (d.results || []).length > 0;
}

module.exports = { pageDansPerimetre, perimetreIds, estSurSujetCode, norm, CHAMPS };
