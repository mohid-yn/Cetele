"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production — and ACTIVELY TEARS IT DOWN in
 * development. Renders nothing.
 *
 * WHY THE TEARDOWN EXISTS, because "production only" was not enough and this
 * cost four debugging sessions before anyone traced it.
 *
 * `sw.js` treats `/_next/static/**` and anything ending `.js` as an immutable
 * static asset and serves it CACHE-FIRST, never revalidating. In production
 * that is correct: Next content-hashes those filenames, so a new build is a new
 * URL and the old entry is simply never asked for again.
 *
 * It is NOT correct when a production build and a dev server share an origin,
 * and on `localhost:3000` they always do. Running `pnpm build && pnpm start`
 * once — which `pnpm test:e2e` does on every run — sets `NODE_ENV=production`,
 * registers the worker, and fills its cache with that build's chunks. Every
 * later `pnpm dev` on the same port then serves DIFFERENT code at colliding
 * `/_next/static/` paths, and the browser keeps handing out the old bytes.
 *
 * The symptom is not a caching error. It is `Element type is invalid … got:
 * undefined`, pointing at whichever component was added most recently — because
 * the stale chunk genuinely does not contain it. It looks exactly like a
 * missing export, and it survives a normal reload (a hard reload bypasses the
 * worker for that one navigation, which is why it "fixes" it until next time).
 *
 * So dev does not merely decline to register: it unregisters whatever is
 * already there and drops our caches. That self-heals any browser that has ever
 * loaded a production build from this origin, on the next page load — the
 * worker never intercepts navigations, so the new HTML always gets through to
 * run this.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});

      // Ours only, by prefix. Blowing away every cache would take any other
      // localhost app's storage with it, and a dev machine has several.
      if (typeof caches !== "undefined") {
        void caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((k) => k.startsWith("cetele-"))
                .map((k) => caches.delete(k)),
            ),
          )
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // registration is best-effort; ignore failures
    });
  }, []);

  return null;
}
