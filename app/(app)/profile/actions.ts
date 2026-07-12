"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

type Result = { error: string | null };

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
