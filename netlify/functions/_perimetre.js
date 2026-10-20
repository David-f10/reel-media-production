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

// Notion traite un id AVEC ou SANS tirets comme la même page → on compare toujours normalisé.
const norm = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase();

// Un sujet (page DB_PROD) est-il dans le périmètre de `nom` ? Lecture des 5 propriétés select.
function pageDansPerimetre(page, nom) {
  const p = page && page.properties;
  if (!p || !nom) return false;
  return CHAMPS.some(c => (p[c] && p[c].select && p[c].select.name) === nom);
}

const _cache = new Map(); // nom → { ids: Set<normId>, ts }

// Ensemble des ids (normalisés) des sujets de `nom`. Caché 60 s par nom. À FROID : une query DB_PROD
// (or sur les 5 champs). Lève en cas d'échec Notion → l'appelant DOIT refuser (fail-closed), jamais relayer.
async function perimetreIds(nom, token) {
  if (!nom) return new Set();
  const now = Date.now();
  const hit = _cache.get(nom);
  if (hit && (now - hit.ts) < CACHE_TTL) return hit.ids;

  const filter = { or: CHAMPS.map(c => ({ property: c, select: { equals: nom } })) };
  const ids = new Set();
  let cursor = null, pages = 0;
  do {
    const b = { filter, page_size: 100 };
    if (cursor) b.start_cursor = cursor;
    const r = await fetch('https://api.notion.com/v1/databases/' + DB_PROD + '/query', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(b)
    });
    if (!r.ok) throw new Error('perimetre query ' + r.status);
    const d = await r.json();
    (d.results || []).forEach(p => ids.add(norm(p.id)));
    cursor = d.has_more ? d.next_cursor : null;
    pages++;
  } while (cursor && pages < 20);

  _cache.set(nom, { ids, ts: now });
  return ids;
}

module.exports = { pageDansPerimetre, perimetreIds, norm, CHAMPS };
