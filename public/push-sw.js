/* Service Worker dédié aux notifications Push du CRM Vrac Québec.
   Il ne met AUCUNE ressource en cache : pas de mode hors ligne,
   pas d'interception de navigation. Uniquement Push + clic + badge. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function setBadge(count) {
  try {
    if (typeof count !== 'number') return;
    if (count > 0 && self.navigator && self.navigator.setAppBadge) {
      self.navigator.setAppBadge(count);
    } else if (self.navigator && self.navigator.clearAppBadge) {
      self.navigator.clearAppBadge();
    }
  } catch (_e) { /* badge non supporté */ }
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = {}; }

  const title = data.title || 'Vrac Québec';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'vrac-quebec',
    renotify: true,
    requireInteraction: !!data.urgent,
    data: { url: data.url || '/admin/notifications', notificationId: data.notificationId || null },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    setBadge(data.badge);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/admin/notifications';

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(target); } catch (_e) { /* ignore */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_BADGE') setBadge(event.data.count);
});
