// Réel Média Production — Service Worker
// PR pwa-push : cache de la coquille + handlers push.
const SW_VERSION = '2026-06-04-2';
const SHELL_CACHE = 'rm-shell-' + SW_VERSION;
const RUNTIME_CACHE = 'rm-runtime-' + SW_VERSION;

// Coquille pré-cachée à l'install. /index.html est volontairement omis :
// il est récupéré en network-first pour ne pas figer une version périmée.
const SHELL_URLS = [
  '/offline.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/views.css',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Stratégies de cache.
// - /.netlify/functions/* : network-only (données Notion, login, push — fraîcheur critique)
// - HTML (navigation) : network-first, fallback cache, ultime fallback offline.html
// - CSS locaux : stale-while-revalidate
// - icons / manifest : cache-first
// - CDN externes (fonts, xlsx, sentry) : cache-first opaque, jamais bloquant
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1. Functions Netlify — toujours réseau, jamais cache
  if (url.pathname.startsWith('/.netlify/functions/')) return;

  // 2. Navigation HTML — network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstHtml(req));
    return;
  }

  // 3. CSS locaux — stale-while-revalidate
  if (url.origin === self.location.origin && url.pathname.endsWith('.css')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 4. Icônes / manifest locaux — cache-first
  if (url.origin === self.location.origin && /\.(png|ico|svg|webmanifest|json)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 5. CDN externes (fonts, xlsx, sentry) — cache-first opaque
  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function networkFirstHtml(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return cached || new Response('', { status: 504 });
  }
}

// ─── Push handlers ───
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { titre: 'Réel Média', message: event.data?.text() || '' }; }
  const titre = data.titre || 'Réel Média';
  const body = data.message || '';
  const sujetId = data.sujetId || null;
  event.waitUntil(
    self.registration.showNotification(titre, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: sujetId || 'rm-' + Date.now(),
      data: { sujetId, type: data.type || null }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const sujetId = event.notification.data?.sujetId;
  const targetUrl = sujetId ? `/?sujet=${encodeURIComponent(sujetId)}` : '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      // Si une fenêtre de l'app est déjà ouverte : la focaliser, lui dire d'ouvrir le sujet
      if (client.url.includes(self.location.origin)) {
        client.postMessage({ action: 'open-sujet', sujetId });
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
