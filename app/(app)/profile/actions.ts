"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import { configureWebPush, sendToDevices } from "@/lib/push/send";

type Result = { error: string | null };

/** Long enough to lock the phone and put it down — the whole point of the test. */
const TEST_PUSH_DELAY_MS = 10_000;

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, uid: data?.claims?.sub as string | undefined };
}

/**
 * Save this device's push subscription (M8). Upserted on `endpoint`: a browser
 * hands back the SAME subscription if it already has one, and re-registering
 * must not pile up duplicate rows for one device.
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}): Promise<Result> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const { error } = await q(
    "push.subscribe",
    supabase.from("push_subscriptions").upsert(
      {
        user_id: uid,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent,
      },
      { onConflict: "endpoint" },
    ),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { error: null };
}

/** Drop this device's subscription (the member turned reminders off here). */
export async function removePushSubscription(
  endpoint: string,
): Promise<Result> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const { error } = await q(
    "push.unsubscribe",
    supabase.from("push_subscriptions").delete().eq("endpoint", endpoint),
  );
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { error: null };
}

/**
 * "Send a test notification" — fires a real push to this member's devices after
 * a 10-second delay, so they can lock the phone and see it arrive the way a real
 * reminder would (a notification that only shows while you're staring at the tab
 * proves nothing).
 *
 * Deliberately uses the SAME send path as the cron dispatcher (`lib/push/send`):
 * a test that took a different route through the code would prove very little.
 * The only things it skips are the schedule and the claim — everything that can
 * actually be misconfigured (VAPID keys, subject, the subscription, the service
 * worker, the OS permission) is exercised for real.
 */
export async function sendTestPush(): Promise<
  Result & { sent?: number; pruned?: number }
> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const { data: subs, error } = await q(
    "push.test (my devices)",
    supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", uid),
  );
  if (error) return { error: error.message };
  if (!subs?.length) {
    return { error: "Turn reminders on for this device first." };
  }
  if (!configureWebPush()) {
    // Names the likely culprit rather than "something went wrong": VAPID_SUBJECT
    // is the one that's easy to forget, and web-push won't sign without it.
    return {
      error: "Push isn't configured on the server (check VAPID_SUBJECT).",
    };
  }

  await new Promise((resolve) => setTimeout(resolve, TEST_PUSH_DELAY_MS));

  const { sent, dead } = await sendToDevices(subs, {
    title: "Cetele",
    body: "Test notification — reminders are working on this device. ✅",
    url: "/today",
    tag: "cetele-test",
  });

  if (dead.length) {
    // This device's subscription is gone (permission revoked / reinstalled).
    // Drop it under RLS — these are my own rows.
    await supabase.from("push_subscriptions").delete().in("endpoint", dead);
    revalidatePath("/profile");
  }

  if (!sent) {
    return {
      error:
        dead.length > 0
          ? "This device's subscription had expired — turn reminders off and on again."
          : "The push service rejected it. Check the VAPID keys on the server.",
    };
  }

  return { error: null, sent, pruned: dead.length };
}

/**
 * Set (or update) the reminder for one task — D30: a plain clock time the member
 * chooses, in their own timezone, plus on/off. Upserted on (user_id, task_id),
 * so the row is created on first use without a separate "add reminder" step.
 *
 * `last_sent_on` is deliberately not writable here (it isn't granted to clients)
 * — only the dispatcher stamps it, so no one can re-arm a send.
 */
export async function setReminder(
  taskId: string,
  time: string,
  enabled: boolean,
): Promise<Result> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  // One atomic RPC (ON CONFLICT DO UPDATE), not a client-side read-then-write:
  // the UI saves on every interaction, so two saves can be in flight at once and
  // an interleaved insert/update lets the LOSER's value win. The RPC also holds
  // the membership guard (you can't set a reminder on a task you can't see).
  const { error } = await q(
    `rpc.set_reminder (${time}, ${enabled ? "on" : "off"})`,
    supabase.rpc("set_reminder", {
      p_task: taskId,
      p_time: time,
      p_enabled: enabled,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { error: null };
}
