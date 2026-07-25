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

/** Running as an installed app rather than in a browser tab. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag (non-standard, iOS only).
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS/iPadOS — where every browser is WebKit and the install rule applies. */
export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/**
 * What this device can actually do, as one value the UI switches on.
 *
 *  ready              — subscribing here will work
 *  ios-needs-install  — iOS, in a browser tab: install to the Home Screen first
 *  unsupported        — no Web Push in this browser at all
 *  unconfigured       — our own VAPID key is missing, so nothing can be sent
 *
 * **This is decided by the PLATFORM RULE, not by feature detection**, and that
 * distinction is the whole bug it replaces. The old check required
 * `!("PushManager" in window)` to conclude "iOS needs installing" — but iOS
 * 16.4+ exposes PushManager and Notification in ordinary Safari tabs, where
 * subscribing still cannot work. So on a modern iPhone every condition passed,
 * `pushSupported()` returned true, and the member was shown a live "Turn on"
 * button that could never succeed. iOS gates push on being installed, whatever
 * the globals say, so that is what we key on.
 */
export type PushEnvironment =
  | "ready"
  | "ios-needs-install"
  | "unsupported"
  | "unconfigured";

export function pushEnvironment(vapidPublicKey: string): PushEnvironment {
  if (typeof window === "undefined") return "unsupported";
  // Ours to get right, and it fails silently at send time — so it outranks
  // anything about the device. An empty key means the button is a lie.
  if (!vapidPublicKey) return "unconfigured";
  if (isIos() && !isInstalled()) return "ios-needs-install";
  if (!pushSupported()) return "unsupported";
  return "ready";
}

function keyToBase64(sub: PushSubscription, name: "p256dh" | "auth"): string {
  const key = sub.getKey(name);
  if (!key) throw new Error(`push subscription is missing its ${name} key`);
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

/**
 * The outcome of asking, as something the UI can act on. A decline is a normal
 * answer and never nagged (D8) — but "iOS refused because we are in a tab" is a
 * different thing entirely, and it deserves install coaching rather than a raw
 * `NotAllowedError` shown as an error message.
 */
export type SubscribeResult =
  | { ok: true; keys: PushKeys }
  | { ok: false; reason: "declined" | "needs-install" | "unsupported" };

/** Ask permission, then subscribe. */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<SubscribeResult> {
  const env = pushEnvironment(vapidPublicKey);
  if (env === "ios-needs-install")
    return { ok: false, reason: "needs-install" };
  if (env !== "ready") return { ok: false, reason: "unsupported" };

  // Belt and braces: if a future iOS starts allowing the call but still refuses
  // to deliver, or our platform check is ever wrong, the refusal surfaces here.
  // Either way the member gets install coaching, not a DOMException.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { ok: false, reason: isIos() ? "needs-install" : "unsupported" };
  }
  if (permission !== "granted") return { ok: false, reason: "declined" };

  const registration = await navigator.serviceWorker.ready;

  // Reuse an existing subscription if the browser already has one for us —
  // re-subscribing would mint a new endpoint and orphan the stored row.
  const existing = await registration.pushManager.getSubscription();
  let sub = existing;
  if (!sub) {
    try {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    } catch {
      // Permission granted but the push service still said no — on iOS that is
      // the not-installed case again (it can grant then refuse).
      return { ok: false, reason: isIos() ? "needs-install" : "unsupported" };
    }
  }

  return {
    ok: true,
    keys: {
      endpoint: sub.endpoint,
      p256dh: keyToBase64(sub, "p256dh"),
      auth: keyToBase64(sub, "auth"),
      userAgent: navigator.userAgent,
    },
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
