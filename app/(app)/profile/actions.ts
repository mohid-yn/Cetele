"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import { configureWebPush, sendToDevices } from "@/lib/push/send";
import { MAX_NAME_LENGTH } from "@/lib/profile";

type Result = { error: string | null };

/** Long enough to lock the phone and put it down — the whole point of the test. */
const TEST_PUSH_DELAY_MS = 10_000;

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, uid: data?.claims?.sub as string | undefined };
}

/**
 * Change my display name.
 *
 * A plain UPDATE, not an RPC: 0003 grants `update (name, avatar_url)` on
 * `profiles` to `authenticated` and the `profiles_update_self` policy pins the
 * row to `auth.uid()`, so the authority is already RLS + the column grant. There
 * is nothing atomic to protect here either — one field, one writer, last write
 * wins is the correct semantics (contrast `set_reminder`, where two controls in
 * one row race).
 *
 * The name is denormalised nowhere — every screen reads `profiles.name` through
 * a join — but it renders on the roster, standings, the admin breakdown and the
 * reaction rows, all server-rendered and all prefetched into the client Router
 * Cache. So this busts the whole tree rather than `/profile`: a member who
 * renames themselves and then finds the old name still on Group would
 * reasonably conclude the save failed. It is a once-in-an-account write, so the
 * cost of the wide revalidate is paid essentially never.
 */
export async function updateName(
  name: string,
): Promise<Result & { name?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Your name can't be empty." };
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { error: `Keep it under ${MAX_NAME_LENGTH} characters.` };
  }

  const { error } = await q(
    "profile.rename",
    supabase.from("profiles").update({ name: trimmed }).eq("id", uid),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  // Returned so the client reconciles from the write's own outcome rather than
  // from a refetch (D45) — and so it shows the TRIMMED name, not what was typed.
  return { error: null, name: trimmed };
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

  // An RPC, not an upsert: PostgREST's upsert compiles to ON CONFLICT DO UPDATE,
  // which needs UPDATE privilege — and push_subscriptions is INSERT/DELETE-only
  // by design (a browser re-subscribes with a new endpoint; it never mutates
  // one). The RPC also reassigns the row if the SAME endpoint comes back for a
  // DIFFERENT user (a shared phone), so reminders never push to the previous
  // owner's device.
  const { error } = await q(
    "rpc.save_push_subscription",
    supabase.rpc("save_push_subscription", {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: sub.userAgent,
    }),
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
    // No emoji: a notification body is rendered by the OS, in the OS's own
    // emoji font, on a surface this app does not style — the one place a glyph
    // is guaranteed to be off-system. The sentence carries it on its own.
    body: "Test notification — reminders are working on this device.",
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
 * Create or update one of the member's own reminders — D62: a name they write
 * and a clock time they pick, in their own timezone, plus on/off. `id` null
 * creates; an id updates that row and only if it is theirs.
 *
 * It is no longer keyed on a task. A reminder used to be upserted on
 * (user_id, task_id), which made the circle's admin the author of how many
 * reminders you had — fifteen of them for a member of three circles.
 *
 * `last_sent_on` is deliberately not writable here (it isn't granted to clients)
 * — only the dispatcher stamps it, so no one can re-arm a send.
 */
export async function setReminder(
  id: string | null,
  label: string,
  time: string,
  enabled: boolean,
): Promise<Result & { id?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  // One atomic RPC, not a client-side read-then-write: the UI saves on every
  // interaction, so two saves can be in flight at once and an interleaved pair
  // lets the LOSER's value win. The RPC also holds the name rule, the
  // per-account cap and the ownership check.
  const { data, error } = await q(
    `rpc.set_reminder (${id ? "update" : "create"} ${time}, ${enabled ? "on" : "off"})`,
    supabase.rpc("set_reminder", {
      // `p_id` is nullable in SQL (null creates), but the generated types render
      // every RPC arg as non-null, so the null case needs the cast — the same
      // cast `setMemberShare` and `setTaskGoal` carry, for the same reason.
      p_id: id as string,
      p_label: label,
      p_time: time,
      p_enabled: enabled,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  // The new row's id, so the client can go on editing what it just created
  // without a refetch (D45) — a second save would otherwise create a duplicate.
  return { error: null, id: data ?? undefined };
}

/**
 * Delete one of the member's reminders. A direct DELETE rather than an RPC:
 * RLS's `reminders_delete_self` is the whole rule, and there is nothing to make
 * atomic — unlike the write path, which carries a cap and a name check.
 */
export async function deleteReminder(id: string): Promise<Result> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const { error } = await q(
    "reminders.delete (own)",
    supabase.from("reminders").delete().eq("id", id),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { error: null };
}

/**
 * Declare two of my tasks to be ONE ACT (D64) — the same dhikr, asked for by two
 * circles, done once and logged once.
 *
 * A thin wrapper over `link_tasks` (the `setMemberShare` shape): the RPC is the
 * only write path into `member_task_links`, and it holds every rule worth
 * holding — membership of both circles, the same-circle refusal, the cluster
 * merge and the ten-task ceiling. None of that could be enforced by a direct
 * insert, which is why the table is select-only to clients.
 *
 * The server's messages are passed through UNCHANGED. "those two tasks are in
 * the same circle" is already the sentence a member needs, and rewording it here
 * would put a second copy of the rule in a file that does not own it.
 */
export async function linkTasks(
  taskA: string,
  taskB: string,
): Promise<Result & { clusterId?: string }> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const { data, error } = await q(
    "rpc.link_tasks",
    supabase.rpc("link_tasks", { p_task_a: taskA, p_task_b: taskB }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  // The whole tree, not just /profile. A link changes what a TAP does — the
  // count screen names the circles a tap will also land in, and Today's numbers
  // move in a circle the member may not be looking at. `revalidatePath("/profile")`
  // would leave the count screen insisting the tasks are unrelated until
  // something else happened to bust it. Linking is a once-in-a-while write, so
  // the wide revalidate costs essentially nothing (`updateName`'s argument).
  revalidatePath("/", "layout");
  return { error: null, clusterId: data ?? undefined };
}

/**
 * Take one task back out of its cluster — and dissolve the cluster if that
 * leaves a single task in it (the RPC's rule, not this one's).
 *
 * Deliberately usable on a task in a circle the member has LEFT. That link is
 * dormant, not deleted — 0019's rule, which `private.linked_tasks` implements by
 * simply not returning it — and the control that clears it has to outlive the
 * membership too, or the member is left with a row they can see and cannot
 * remove.
 */
export async function unlinkTask(taskId: string): Promise<Result> {
  const { supabase, uid } = await me();
  if (!uid) return { error: "You are signed out." };

  const { error } = await q(
    "rpc.unlink_task",
    supabase.rpc("unlink_task", { p_task: taskId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
