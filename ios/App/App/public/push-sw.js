// Aetheria AI - Web Push & iOS 18.6.2 Home Screen Notification / Badging Companion
/* eslint-disable no-restricted-globals */

self.addEventListener('push', function (event) {
  let payload = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : '' };
    } catch {
      payload = {};
    }
  }

  const title = payload.title || 'Aetheria Studio';
  const body = payload.body || 'Tác vụ AI trên máy chủ đã xử lý xong.';
  const tag = payload.tag || payload.jobId || 'aetheria-bg-job';
  const url = payload.url || '/';
  const badgeCount = typeof payload.badgeCount === 'number' ? payload.badgeCount : 1;

  const notifyPromise = self.registration.showNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    data: {
      url,
      jobId: payload.jobId,
      storyId: payload.storyId,
      chapterId: payload.chapterId,
      status: payload.status
    }
  });

  const badgePromise =
    self.navigator && typeof self.navigator.setAppBadge === 'function'
      ? badgeCount > 0
        ? self.navigator.setAppBadge(badgeCount).catch(function () {})
        : self.navigator.clearAppBadge().catch(function () {})
      : Promise.resolve();

  event.waitUntil(Promise.all([notifyPromise, badgePromise]));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = (event.notification && event.notification.data) || {};
  const targetUrl = data.url || '/';

  const clearBadgePromise =
    self.navigator && typeof self.navigator.clearAppBadge === 'function'
      ? self.navigator.clearAppBadge().catch(function () {})
      : Promise.resolve();

  const focusOrOpenPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.postMessage({ type: 'AETHERIA_PUSH_CLICK', data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    });

  event.waitUntil(Promise.all([clearBadgePromise, focusOrOpenPromise]));
});

self.addEventListener('message', function (event) {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'SKIP_WAITING' && typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  } else if (msg.type === 'AETHERIA_CLEAR_BADGE') {
    if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
      self.navigator.clearAppBadge().catch(function () {});
    }
  }
});
