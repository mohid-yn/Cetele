"use client";

/**
 * Browser side of Web Push (M8 / CET-11).
 *
 * The subscription is minted by the browser's push service, not by us: we hand
 * it our VAPID *public* key, and it returns an endpoint + two keys that only
 * our private key can send to. Those three values are what the server stores.
 */

/**
 * The applicationServerKey must be raw bytes, not the base64url we ship.
 * Backed by an explicit ArrayBuffer: `Uint8Array.from` is typed over
 * ArrayBufferLike, which `BufferSource` won't accept.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
};

/** Web Push needs a service worker; iOS additionally needs a Home-Screen install. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iOS/iPadOS only delivers push to a PWA installed to the Home Screen (16.4+).
 * In a normal Safari tab there is no PushManager at all — so rather than show a
 * button that cannot work, the UI shows install coaching. This detects "iOS, not
 * installed", which is exactly that case.
 */
export function needsIosInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag (non-standard, iOS only).
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !installed && !("PushManager" in window);
}

function keyToBase64(sub: PushSubscription, name: "p256dh" | "auth"): string {
  const key = sub.getKey(name);
  if (!key) throw new Error(`push subscription is missing its ${name} key`);
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

/**
 * Ask permission, then subscribe. Returns null if the user declines — a refusal
 * is a normal answer, not an error, and must never be nagged (D8).
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushKeys | null> {
  if (!pushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription if the browser already has one for us —
  // re-subscribing would mint a new endpoint and orphan the stored row.
  const existing = await registration.pushManager.getSubscription();
  const sub =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  return {
    endpoint: sub.endpoint,
    p256dh: keyToBase64(sub, "p256dh"),
    auth: keyToBase64(sub, "auth"),
    userAgent: navigator.userAgent,
  };
}

/** Unsubscribe this device. Returns the endpoint that was dropped, if any. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return null;
  const { endpoint } = sub;
  await sub.unsubscribe();
  return endpoint;
}

/** Is THIS device subscribed? (The server knows the user's devices, not which one you're on.) */
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
