// netlify/functions/acces-gerer.js
// Gérer les accès de SA marque (ajouter / retirer / redonner). RÉSERVÉ aux contacts dont la case « Peut gérer les
// accès » est cochée (porte unique — David l'ouvre marque par marque). ⛔ Toute écriture Notion passe par le FUNNEL
// appelNotion (_notionio) : le refus en lecture seule (emprunt chef) vit à l'octet où part la requête, et il n'y a
// AUCUN fetch Notion brut ici → le garde-fou ro-ecriture-garde reste vert sans entrée dans EXCEPTIONS.
//   · Code Brand + Marque de la nouvelle page viennent du JETON de l'appelant, JAMAIS du corps de requête.
//   · « Peut gérer les accès » créé DÉCOCHÉ : un gérant ne fabrique pas d'autres gérants (c'est David qui coche).
//   · Retirer/redonner NE SUPPRIME PAS : bascule « Actif ». ⛔ pas soi-même ; ⛔ cible désignée par le MAIL (jamais un
//     id de page), résolue serveur dans la marque de l'appelant — la requête ne fournit AUCUN id de confiance, donc
//     rien à revérifier (plus fort qu'access-set.js) ; aucun id de contact ne circule au navigateur.
//   · ⛔ Aucune valeur de code n'est lue hors génération/écriture, ni journalisée, ni renvoyée.

const { verifier } = require('./_clienttoken');
const { contactActif, accesClient, statutAjoutMail, genererCodeAcces, trouverCible } = require('./_authclient');
const { appelNotion } = require('./_notionio');

const normId = (s) => String(s == null ? '' : s).replace(/-/g, '').toLowerCase();
const RE_MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
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

  const token = process.env.NOTION_TOKEN, dbId = process.env.DB_CONTACTS_CLIENT;
  if (!token || !dbId) { console.error('acces-gerer indispo : config manquante (NOTION_TOKEN=' + !!token + ', DB_CONTACTS_CLIENT=' + !!dbId + ')'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // ── Identité : UNIQUEMENT le jeton. ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  // Garde ro LOCALE (ceinture) — appelNotion refuse déjà au réseau (bretelles). Les deux, voulu.
  if (vt.ro) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Mode consultation : lecture seule' }) };

  // Garde : contact actif + marque ouverte (révocation ~60 s) ; donne Code Brand, Marque et `gere`. Panne → 503.
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  // PORTE unique du lot : seul un gérant agit. Sinon l'écran est en lecture, comme avant.
  if (!liv.gere) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };

  const action = String(body.action == null ? '' : body.action).trim();
  try {
    if (action === 'ajouter') {
      const nom = String(body.nom == null ? '' : body.nom).trim();
      const mail = String(body.mail == null ? '' : body.mail).trim();
      if (!nom || !RE_MAIL.test(mail)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Nom et adresse e-mail valides requis' }) };

      // Unicité du mail (un seul scan en mémoire — pas de canal temporel). memeMarque et ailleurs partagent le
      // MÊME code HTTP ; seul le message diffère (explicite dans SA marque, générique ailleurs). ⛔ On ne confirme
      // jamais l'existence d'un contact d'une autre marque.
      const st = await statutAjoutMail(liv.codeBrand, mail);
      if (!st.ok) return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
      if (st.statut === 'memeMarque') return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Cette personne a déjà accès à cet espace.' }) };
      if (st.statut === 'ailleurs') return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Cette adresse ne peut pas être ajoutée. Écrivez à votre interlocuteur chez Réel Média.' }) };

      // Code généré serveur (jamais saisi). Suffixe sur collision dans la marque, depuis les codes déjà présents.
      const acc = await accesClient(liv.codeBrand, null, true);
      if (!acc.ok) return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
      const code = genererCodeAcces(liv.marque, nom, (acc.acces || []).map(x => x.code));

      // ⛔ Code Brand + Marque DU JETON (liv), jamais du corps. Actif coché, « Peut gérer les accès » DÉCOCHÉ.
      const props = {
        'Nom': { title: [{ text: { content: nom } }] },
        'Mail': { rich_text: [{ text: { content: mail } }] },           // Mail = rich_text (schéma vérifié), pas un champ email
        'Code acces': { rich_text: [{ text: { content: code } }] },
        'Code Brand': { rich_text: [{ text: { content: liv.codeBrand } }] },
        'Marque': { rich_text: [{ text: { content: liv.marque || '' } }] },
        'Actif': { checkbox: true },
        'Peut gérer les accès': { checkbox: false }
      };
      const w = await appelNotion(vt.ro, '/pages', 'POST', token, { parent: { database_id: dbId }, properties: props });
      if (!w.ok) throw new Error('POST ' + w.status);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }; // ⛔ réponse NUE : le gérant lit le code dans la liste rechargée
    }

    if (action === 'retirer' || action === 'redonner') {
      // ⛔ Cible désignée par le MAIL, jamais par un id de page (aucun id de contact ne transite par le navigateur).
      const mail = String(body.mail == null ? '' : body.mail).trim();
      if (!RE_MAIL.test(mail)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Cible invalide' }) };

      // Résolution SERVEUR : marque de l'appelant D'ABORD, puis mail dedans ; doublon → refus (fail-closed). ⛔ Un
      // mail hors marque, inexistant, ou ambigu donnent le MÊME 403 : pas d'oracle d'existence sur une autre marque.
      const t = await trouverCible(liv.codeBrand, mail);
      if (!t.ok) return { statusCode: t.raison === 'indispo' ? 503 : 403, headers, body: JSON.stringify({ ok: false, error: t.raison === 'indispo' ? 'Service temporairement indisponible' : 'Accès refusé' }) };
      // ⛔ pas soi-même — comparaison sur l'id RÉSOLU côté serveur, jamais sur un id de requête.
      if (normId(t.id) === normId(vt.id)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Vous ne pouvez pas retirer votre propre accès.' }) };

      const w = await appelNotion(vt.ro, '/pages/' + t.id, 'PATCH', token, { properties: { 'Actif': { checkbox: action === 'redonner' } } });
      if (!w.ok) throw new Error('PATCH ' + w.status);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Action inconnue' }) };
  } catch (e) {
    // ⛔ marqueur fixe + e.name seulement : un corps tronqué (Node 20+) porterait un fragment de page, code compris.
    console.error('acces-gerer indispo (' + (e && e.name || 'Error') + ')');
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };
  }
};
