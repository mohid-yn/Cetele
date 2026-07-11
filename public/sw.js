// Cetele service worker — minimal, deliberately non-invasive.
// Bump CACHE when this file changes to activate the new version + wipe old
// caches (the activate handler deletes every cache != CACHE).
//
// v2 (2026-07-05): v1 cached "/" (the login page) and intercepted navigations
// + cross-origin requests, which broke the OAuth round-trip (served a stale
// login shell, and threw "Failed to fetch" on Supabase/Google calls). v2 never
// touches navigations, /auth/*, or cross-origin — it only lightly caches
// same-origin static GETs, and never precaches an HTML page.
//
// v3 (2026-07-11): cache bump only — forces browsers still running a stale v1
// (which intercepted the `/?code=…` OAuth navigation and returned a network
// error) to reinstall + wipe the old cache on activate. Fetch logic unchanged
// from v2. Pairs with the proxy safety net that routes a `/?code=` landing to
// /auth/callback for the server-side exchange.
const CACHE = "cetele-static-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept: cross-origin (Supabase/Google/CDN), auth routes, or
  // navigations — the browser must handle these natively so redirects,
  // cookies and the OAuth exchange are never disturbed.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth")) return;
  if (request.mode === "navigate") return;

  // Same-origin static GET: cache-first, fall back to network, never throw.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => Response.error()),
    ),
  );
});
