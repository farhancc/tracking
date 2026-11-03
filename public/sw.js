/* FiveYearOS service worker: offline app shell, cached pages, and push. */
const VERSION = "v2";
const STATIC = `fyos-static-${VERSION}`;
const PAGES = `fyos-pages-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fyos-") && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API responses or auth flows: they're personal and must be fresh.
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  // Hashed build assets and icons: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: network first, keep the last good copy for offline use.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic" && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req, { cacheName: PAGES })) || (await caches.match(OFFLINE))),
    );
  }
});

async function cachePage(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/login") return;
  try {
    const res = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (res.ok && res.type === "basic" && !res.redirected) await (await caches.open(PAGES)).put(url.href, res);
  } catch {
    // offline or failed: keep the previous copy
  }
}

self.addEventListener("message", (event) => {
  // Signing out clears cached pages (they contain personal data).
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
  // Keep the everyday pages ready for offline use.
  if (event.data && event.data.type === "warm" && Array.isArray(event.data.paths)) {
    event.waitUntil(Promise.all(event.data.paths.slice(0, 10).map(cachePage)));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "FiveYearOS", body: "", url: "/today", tag: undefined };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, tag: data.tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
