/* FlatMate service worker.
 * Scope: installability, an offline fallback page, and caching of immutable static assets.
 * It deliberately does NOT cache pages, API calls or Supabase traffic, so household data is never stale.
 * It also shows push notifications and opens the right screen when one is tapped.
 * Bump VERSION to invalidate old caches.
 */
const VERSION = "v3";
const STATIC_CACHE = `flatmate-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Full page loads: network first, offline page if the network is down.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed build assets and icons never change for a given URL: cache first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

// A path inside this app, or the inbox. Anything else (another site, "//host", "/\host") is
// ignored, so a push can never send someone off-site.
function safePath(value) {
  return typeof value === "string" && /^\/([^/\\]|$)/.test(value) ? value : "/notifications";
}

// A push carries only a title, one short line and a path (SPEC-notifications N9).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : "FlatMate";
  const body = typeof data.body === "string" ? data.body.slice(0, 200) : "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/192",
      badge: "/icons/192",
      data: { path: safePath(data.path) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.path);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => "focus" in client);
      if (!open) return self.clients.openWindow(path);
      const navigated = "navigate" in open ? open.navigate(path) : Promise.resolve(open);
      return navigated.then((client) => (client || open).focus());
    }),
  );
});
