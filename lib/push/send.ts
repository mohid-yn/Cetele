import webpush from "web-push";

/**
 * Server-side Web Push sending — shared by the cron dispatcher
 * (`/api/push/dispatch`) and the "send a test notification" button on Profile,
 * so there is exactly ONE implementation of signing, payload shape, and
 * dead-device detection. A test that took a different code path to the real
 * sender would prove very little.
 */

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

/**
 * Load the VAPID keys. Returns false when they're missing, so callers can fail
 * cleanly instead of throwing. VAPID_SUBJECT is easy to forget and web-push
 * refuses to sign without it — every push would fail silently.
 */
export function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Send one payload to many devices. Returns how many landed and which endpoints
 * are dead — a push service answering 404/410 means the subscription is gone for
 * good (uninstalled, permission revoked), so the caller should delete it.
 * Anything else (a network blip, a 5xx) is transient and left alone.
 */
export async function sendToDevices(
  targets: PushTarget[],
  payload: PushPayload,
): Promise<{ sent: number; dead: string[] }> {
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(t.endpoint);
      }
    }),
  );

  return { sent, dead };
}
