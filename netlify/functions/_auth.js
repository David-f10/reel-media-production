// netlify/functions/_auth.js
// Module partagé : vérification du code d'accès d'un utilisateur via Notion 👥 Équipe.
// Le préfixe '_' évite que ce fichier soit exposé comme function Netlify.
// Réutilise la même logique que login.js, avec son propre cache mémoire 60s.

const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';
const CACHE_TTL = 60 * 1000;

let membresCache = null;
let cacheTimestamp = 0;

async function getMembres(token) {
  const now = Date.now();
  if (membresCache && (now - cacheTimestamp) < CACHE_TTL) return membresCache;
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
    const membres = await getMembres(token);
    const page = membres.find(p => p.id === id);
    if (!page) return { ok: false, error: 'Membre introuvable' };
    const pr = page.properties;
    const codeNotion = pr['Code acces']?.rich_text?.[0]?.plain_text || '';
    if (!codeNotion || codeNotion !== code) return { ok: false, error: 'Code incorrect' };
    const nom = pr.Nom?.title?.[0]?.plain_text || '';
    const role = pr.Role?.select?.name || 'Journaliste';
    return { ok: true, user: { id: page.id, nom, role } };
  } catch (e) {
    return { ok: false, error: 'Service temporairement indisponible' };
  }
}

module.exports = { verifyUser };
