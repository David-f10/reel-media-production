// netlify/functions/_auth.js
// Module partagé : vérification du code d'accès d'un utilisateur via Notion 👥 Équipe.
// Le préfixe '_' évite que ce fichier soit exposé comme function Netlify.
// Réutilise la même logique que login.js, avec son propre cache mémoire 60s.

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const CACHE_TTL = 60 * 1000;

let membresCache = null;
let cacheTimestamp = 0;
let lastForcedRefresh = 0;          // borne anti-amplification du refresh-on-miss
const FORCE_FLOOR = 10 * 1000;      // au plus 1 relecture forcée par 10 s

async function getMembres(token, force = false) {
  const now = Date.now();
  if (!force && membresCache && (now - cacheTimestamp) < CACHE_TTL) return membresCache;
  const res = await fetch(`https://api.notion.com/v1/databases/${DB_EQUIPE}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ page_size: 100 })
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  const data = await res.json();
  membresCache = data.results;
  cacheTimestamp = now;
  return membresCache;
}

// Vérifie que (id Notion, code) correspond à un membre.
// Renvoie { ok:true, user:{id,nom,role} } si succès, { ok:false, error } sinon.
async function verifyUser({ id, code }) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { ok: false, error: 'Token Notion manquant' };
  if (!id || !code) return { ok: false, error: 'Paramètres manquants' };
  try {
    let membres = await getMembres(token);
    let page = membres.find(p => p.id === id);
    let codeNotion = page ? (page.properties['Code acces']?.rich_text?.[0]?.plain_text || '') : '';
    // Refresh-on-miss BORNÉ : un (id,code) qui ne matche pas la liste en cache déclenche UNE relecture
    // (gère un code tout juste changé sans attendre l'échéance 60 s — sinon l'app entière tombe en 401
    // pendant ≤60 s). Un miss n'arrive qu'avec un code faux ou juste changé → jamais en régime normal.
    // FORCE_FLOOR borne à 1 relecture/10 s, même sous un flot de codes faux (anti-amplification Notion/
    // Netlify, app sous alerte quota). Cache par instance : chaque instance se resynchronise seule au 1er miss.
    if ((!page || codeNotion !== code) && (Date.now() - lastForcedRefresh > FORCE_FLOOR)) {
      lastForcedRefresh = Date.now();
      membres = await getMembres(token, true);
      page = membres.find(p => p.id === id);
      codeNotion = page ? (page.properties['Code acces']?.rich_text?.[0]?.plain_text || '') : '';
    }
    if (!page) return { ok: false, error: 'Membre introuvable' };
    if (!codeNotion || codeNotion !== code) return { ok: false, error: 'Code incorrect' };
    const nom = page.properties.Nom?.title?.[0]?.plain_text || '';
    const role = page.properties.Role?.select?.name || 'Journaliste';
    return { ok: true, user: { id: page.id, nom, role } };
  } catch (e) {
    return { ok: false, error: 'Service temporairement indisponible' };
  }
}

module.exports = { verifyUser };
