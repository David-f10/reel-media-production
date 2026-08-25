// netlify/functions/notify.js
// Crée la page Notification dans Notion (comme l'ancien createNotif), puis envoie un push Web
// instantané à chaque device enregistré du destinataire (via web-push + VAPID).
//
// Body attendu :
//   { type, sujetId, sujetCode, sujetTitre, destinataire, auteur, message }
//
// Effets :
//   1. POST Notion /pages → page créée dans la base Notifications (4398775b-...)
//   2. Lecture des subscriptions du destinataire dans Netlify Blobs ("push-subs")
//   3. Envoi push à chaque subscription. Erreurs 410/404 → subscription retirée du store.
//   4. Retour { ok:true, notifId, pushed:N }

const webpush = require('web-push');
const { getPushStore } = require('./_blobs');

const DB_NOTIFS = '4398775b-c11f-4d73-99c4-9fc31c33ce8b';
const DEDUP_TTL_MS = 20000; // dédup serveur : 20 s. Assez pour absorber un double-fire (double-clic,
                            // deux handlers, re-blur post-reload), bien trop court pour manger un vrai
                            // ré-événement (V2 annulée puis redéposée = minutes).

function configureVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) throw new Error('VAPID env vars manquantes');
  webpush.setVapidDetails(subject, pub, priv);
}

async function createNotionNotif({ type, sujetId, sujetCode, sujetTitre, destinataire, auteur, message }) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN manquant');
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parent: { database_id: DB_NOTIFS },
      properties: {
        'Message': { title: [{ text: { content: String(message || '') } }] },
        'Type': { select: { name: String(type || 'nouveau_sujet') } },
        'Destinataire': { rich_text: [{ text: { content: String(destinataire || '') } }] },
        'Auteur': { rich_text: [{ text: { content: String(auteur || '') } }] },
        'Sujet ID': { rich_text: [{ text: { content: String(sujetId || '') } }] },
        'Sujet code': { rich_text: [{ text: { content: String(sujetCode || '') } }] },
        'Sujet titre': { rich_text: [{ text: { content: String(sujetTitre || '') } }] },
        'Lu': { checkbox: false }
      }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Notion create page: ' + res.status + ' ' + t);
  }
  return res.json();
}

// Dédup best-effort (clé destinataire + message, fenêtre DEDUP_TTL_MS) : neutralise les
// doublons quasi-simultanés, tous types confondus, y compris ceux que les gardes client
// (variables module) ratent au rechargement de page. FAIL-OPEN : toute erreur de vérif →
// retourne false (on envoie). Mieux vaut un doublon qu'une notification perdue. Une seule
// tentative, pas de retry : retenter ne ferait qu'ajouter de la latence à une vérif qui
// laisse passer de toute façon en cas d'échec.
async function notifDoublonRecent(destinataire, message) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch('https://api.notion.com/v1/databases/' + DB_NOTIFS + '/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 1,
        filter: { and: [
          { property: 'Destinataire', rich_text: { equals: destinataire } },
          { property: 'Message', title: { equals: message } },
          { timestamp: 'created_time', created_time: { on_or_after: new Date(Date.now() - DEDUP_TTL_MS).toISOString() } }
        ] }
      })
    });
    if (!res.ok) return false; // fail-open
    const data = await res.json();
    return Array.isArray(data.results) && data.results.length > 0;
  } catch (e) {
    console.warn('Dédup : vérification échouée (on envoie) :', e.message);
    return false; // fail-open
  }
}

async function sendPushes(destinataire, payload) {
  if (!destinataire) return 0;
  const store = getPushStore();
  const subs = (await store.get(destinataire, { type: 'json' })) || [];
  if (!subs.length) return 0;

  const survivors = [];
  let pushed = 0;
  await Promise.all(subs.map(async (sub) => {
    if (!sub || !sub.endpoint) return;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload)
      );
      pushed++;
      survivors.push(sub);
    } catch (err) {
      // 410 Gone / 404 Not Found = subscription morte → on ne la garde pas
      const status = err?.statusCode;
      if (status === 410 || status === 404) return;
      // Autres erreurs : on garde la subscription, mais on log
      console.warn('push send error', status, err?.message);
      survivors.push(sub);
    }
  }));

  // Nettoyage si des subs ont été retirées
  if (survivors.length !== subs.length) {
    if (survivors.length === 0) await store.delete(destinataire);
    else await store.setJSON(destinataire, survivors);
  }
  return pushed;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }

  const { type, sujetId, sujetCode, sujetTitre, destinataire, auteur, message } = body;
  // Garde-fou identique à l'ancien createNotif côté client : pas se notifier soi-même
  if (!destinataire || destinataire === auteur) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true }) };
  }

  // Dédup (message vide → on n'interroge pas, ça sur-matcherait, et on envoie quand même).
  if (message && await notifDoublonRecent(destinataire, message)) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, deduped: true }) };
  }

  let notifId = null;
  try {
    const notif = await createNotionNotif({ type, sujetId, sujetCode, sujetTitre, destinataire, auteur, message });
    notifId = notif?.id || null;
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: 'Création notif Notion échouée: ' + e.message }) };
  }

  // Push best-effort : si VAPID mal configuré ou push échoue, on ne casse pas la notif Notion
  let pushed = 0;
  try {
    configureVapid();
    const titre = sujetCode ? `${sujetCode} — Réel Média` : 'Réel Média';
    pushed = await sendPushes(destinataire, {
      titre,
      message: String(message || ''),
      sujetId: sujetId || null,
      type: type || null
    });
  } catch (e) {
    console.warn('Push skipped:', e.message);
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, notifId, pushed }) };
};
