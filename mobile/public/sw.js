// mobile/public/sw.js - minimal service worker, just enough to make the
// site installable as a PWA and to handle Web Push notifications. No
// asset caching/offline support - that's a separate project from "push
// notifications need a service worker to exist at all".

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    payload = { title: 'DRPN', body: event.data.text() };
  }

  const { title, body, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'DRPN', {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: url || '/' },
    })
  );
});

// Focus an existing tab on the target URL if one's open, otherwise open
// a new one - the standard "tapping a notification" behavior.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
