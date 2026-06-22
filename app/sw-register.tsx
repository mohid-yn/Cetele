"use client";

import { useEffect } from "react";

// Registers the service worker on the client (production only — avoids
// caching headaches during dev). Renders nothing.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // registration is best-effort; ignore failures
    });
  }, []);

  return null;
}
