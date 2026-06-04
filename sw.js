// Réel Média Production — Service Worker
// PR pwa-install : version minimale, enregistrement + passthrough.
// Le cache et le push arriveront en PR 2 (pwa-push).
const SW_VERSION = '2026-06-04-1';

self.addEventListener('install', event => {
  // Prendre la main immédiatement, sans attendre la fermeture des onglets
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Devenir le contrôleur des pages déjà ouvertes
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // Passthrough : aucune interception, aucun cache.
  // (Présent pour rendre l'app installable selon les critères PWA.)
  return;
});
