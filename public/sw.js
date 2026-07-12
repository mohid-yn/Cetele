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
//
// v4 (2026-07-12): **cache only static assets — never app data.** v2/v3 skipped
// navigations but still cache-first-cached every *other* same-origin GET, and an
// RSC payload fetch is not a navigation: it's a `dest: empty` GET. So the app's
// own React Server Component payloads were being cached permanently, keyed by
// URL, with no expiry and no notion of who was signed in. Two consequences:
//   1. Stale data. A page's payload is captured (notably by a nav *prefetch*),
//      then replayed after a write — an admin corrects a member's count, walks
//      back to the screen, and sees the pre-edit number. The network is never
//      consulted, so no amount of revalidatePath/staleTimes on the Next side
//      helps: the service worker sits in front of all of it.
//   2. Worse, those payloads are authenticated and RLS-scoped *per user*. Same
//      URL + cache-first + no auth check means one user's cached group data can
//      be handed to the next person to sign in on a shared device.
// The rule is now an allowlist: hashed build output and static files only.
// Anything that can carry user data goes to the network, always.
// v5 (2026-07-12): adds the Web Push handlers (M8/CET-11). Caching logic is
// UNCHANGED from v4 — the allowlist rule below still stands, and this bump is
// what makes browsers pick up the new push/notificationclick listeners.
const CACHE = "cetele-static-v5";

/** Immutable build output + static files. Everything else is app data. */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|gif|webp|ico|webmanifest)$/.test(
      url.pathname,
    )
  );
}

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

// ---------------------------------------------------------------------------
// Web Push (M8 / CET-11). The payload is built by /api/push/dispatch.
//
// iOS only delivers these to a PWA installed to the Home Screen (16.4+) — hence
// the install-coaching screen in the app. Android/desktop need no install.
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push with no/!JSON payload still deserves to show something rather than
    // silently drop (some browsers penalise a push that shows no notification).
  }

  const title = data.title || "Cetele";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Time for your dhikr.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Same tag ⇒ a re-sent reminder replaces the old one instead of stacking.
      tag: data.tag || "cetele-reminder",
      data: { url: data.url || "/today" },
    }),
  );
});

// Tapping the notification focuses an open tab (navigating it to the target) or
// opens a new one — never leaves the user staring at a dead notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
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

  // Anything that isn't an immutable static asset is app data (RSC payloads,
  // Server Action responses, route handlers) — always go to the network, so a
  // signed-in user never reads another request's cached rows. See v4 above.
  if (!isStaticAsset(url)) return;

  // Static asset: cache-first, fall back to network, never throw.
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
