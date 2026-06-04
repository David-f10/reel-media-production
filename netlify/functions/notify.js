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
const { getStore } = require('@netlify/blobs');

const DB_NOTIFS = '4398775b-c11f-4d73-99c4-9fc31c33ce8b';

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

async function sendPushes(destinataire, payload) {
  if (!destinataire) return 0;
  const store = getStore('push-subs');
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
