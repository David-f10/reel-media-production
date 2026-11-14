// netlify/functions/clients-admin.js
// Lot 3 — écran d'administration des accès clients, en LECTURE SEULE. N'ÉCRIT RIEN (créer / coder / désactiver
// = lot 4). Authentifié comme access-set.js : membre vérifié (verifyUser, x-rm-id / x-rm-code) ET porteur du
// droit CLIENT « Peut gérer les clients » (distinct de la clé équipe). Réutilise les caches 60 s de
// _authclient.adminClients (0 requête à chaud). ⛔ Ne lit ni ne renvoie JAMAIS un « Code acces ».
//
// Actions :
//   'liste' (défaut) → { ok:true, marques:[{ code, nom, ouverte, series, nbProjets, nbActifs }] } (tri par code)
//   'fiche' (codeBrand) → { ok:true, marque:{ code, nom, ouverte, series, nbProjets },
//                           interlocuteurs:[{ nom, mail, actif }] }

const { verifyUser } = require('./_auth');          // IMPORT seul
const { adminClients } = require('./_authclient');

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-rm-id, x-rm-code',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  // Appelant : identifié ET porteur du droit CLIENT.
  const rid = (event.headers && (event.headers['x-rm-id'] || event.headers['X-Rm-Id'])) || '';
  const rcode = (event.headers && (event.headers['x-rm-code'] || event.headers['X-Rm-Code'])) || '';
  const auth = await verifyUser({ id: rid, code: rcode });
  if (!auth.ok || !auth.user || auth.user.peutGererClients !== true) {
    return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Réservé aux gestionnaires des clients' }) };
  }

  const d = await adminClients();
  if (!d.ok) return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) };

  const nbActifs = (code) => d.contacts.filter(c => norm(c.codeBrand) === norm(code) && c.actif).length;
  const action = String(body.action || 'liste');

  if (action === 'fiche') {
    const code = String(body.codeBrand || '').trim();
    const m = d.marques.find(x => norm(x.code) === norm(code));
    if (!m) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: 'Marque inconnue' }) };
    const interlocuteurs = d.contacts
      .filter(c => norm(c.codeBrand) === norm(code))
      .map(c => ({ nom: c.nom, mail: c.mail, actif: c.actif }))   // ⛔ jamais de code
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, marque: m, interlocuteurs }) };
  }

  // 'liste' : une ligne par marque, comptage des interlocuteurs actifs, tri par code.
  const marques = d.marques
    .map(m => ({ code: m.code, nom: m.nom, ouverte: m.ouverte, series: m.series, nbProjets: m.nbProjets, nbActifs: nbActifs(m.code) }))
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'fr'));
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, marques }) };
};
