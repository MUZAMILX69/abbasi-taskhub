// Let the browser manage application assets; never cache authenticated API responses.
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("abbasi-taskhub-"))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch { data = { body: event.data.text() }; }
  }
  event.waitUntil(self.registration.showNotification(data.title || "Abbasi TaskHub", {
    body: data.body || "You have a new task",
    icon: "/logo-192.png", badge: "/logo-192.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "abbasi-task-notification",
    data: { url: "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "focus" in client) {
        return client.focus();
      }
    }
    return self.clients.openWindow("/");
  })());
});
