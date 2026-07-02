/* Service Worker — El Portal de la Pareja
   Se encarga de recibir las notificaciones push y de que
   la PWA sea instalable. */

const CACHE_NAME = 'portal-pareja-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── PUSH NOTIFICATIONS ───
self.addEventListener('push', (event) => {
  let data = { title: 'El Portal de la Pareja', body: '¡Tenés novedades! 💕', icon: 'assets/logo-192.png' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: data.icon || 'assets/logo-192.png',
    badge: 'assets/logo-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    tag: data.tag || 'portal-pareja',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Al tocar la notificación, abrir (o enfocar) la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
