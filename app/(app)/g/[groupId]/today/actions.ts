"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import { groupHref, GROUP_WRITE_PATHS } from "@/lib/group-href";
import { MAX_FREQUENCY_DAYS } from "@/lib/goals";
import type { ReactionKind } from "@/lib/retention";

/**
 * The tap path (M3). All integrity rules live in the increment_count RPC
 * (delta bounds, sanity cap, 14-day window in the user's timezone, membership)
 * — this action just relays and revalidates. Returns the authoritative count
 * so the optimistic client can reconcile.
 */
export async function incrementCount(
  groupId: string,
  taskId: string,
  date: string,
  delta: number,
): Promise<{ count: number | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    `rpc.increment_count (+${delta})`,
    supabase.rpc("increment_count", {
      p_task: taskId,
      p_date: date,
      p_delta: delta,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { count: null, error: error.message };

  // Concrete paths, not the route template — see GROUP_WRITE_PATHS.
  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { count: data, error: null };
}

/**
 * One-tap peer encouragement (CET-18). Every rule lives in the toggle_reaction
 * RPC — both parties' membership, the no-self-reaction check, the valid kinds,
 * and the sender's local date (stamped server-side so a client can't back-date
 * an encouragement) — so this is a relay. Returns whether the reaction now
 * stands, which is what the optimistic pill reconciles against.
 */
export async function toggleReaction(
  groupId: string,
  toUserId: string,
  kind: ReactionKind,
): Promise<{ reacted: boolean; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    `rpc.toggle_reaction (${kind})`,
    supabase.rpc("toggle_reaction", {
      p_to: toUserId,
      p_group: groupId,
      p_kind: kind,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { reacted: false, error: error.message };

  // Only /today shows reactions — no need to bust the other group screens.
  revalidatePath(groupHref(groupId, "/today"));
  return { reacted: data as boolean, error: null };
}

/**
 * Dismiss a fresh-start banner (CET-19). The key identifies the OCCURRENCE
 * (`week:2026-W29`), so this week's dismissal never suppresses next week's
 * landmark. Insert-only and idempotent: re-dismissing is a no-op, not an error.
 */
export async function dismissBanner(
  key: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) return { error: "Not signed in" };

  // A plain INSERT, deliberately NOT an upsert: PostgREST compiles upsert to
  // ON CONFLICT DO UPDATE, and this table has no UPDATE grant (a dismissal is a
  // fact, not a setting) — so an upsert would die `permission denied`. That is
  // the bug that shipped on push_subscriptions (0014). A repeat dismissal just
  // hits the primary key; 23505 IS the success case here.
  const { error } = await supabase
    .from("banner_dismissals")
    .insert({ user_id: me, key });
  if (error && error.code !== "23505") return { error: error.message };
  return { error: null };
}

// setTimezone moved to app/(app)/groups/actions.ts (D44): the timezone belongs
// to the PERSON, not a circle, and it must be settable from /groups — before
// the member reaches any screen that renders a date.

/**
 * Raise (or clear) my own bar for one task — the personal stretch goal, D51.
 *
 * Every rule lives in the set_task_goal RPC: membership, the sanity cap, and
 * the raise-only floor that turns any value at or below the circle's share into
 * a CLEAR rather than a stored number. Returns the EFFECTIVE target so the
 * client reconciles from the write (D45) instead of a refetch — including in
 * the clear case, where what comes back is the group's own target.
 */
/**
 * Come round MORE often than my circle asks, or drop back to its cycle (0021).
 *
 * Same shape as setTaskGoal: every rule lives in the RPC (membership, the
 * more-often-only floor that turns any value at or above the circle's interval
 * into a CLEAR), and it returns the EFFECTIVE frequency so the client
 * reconciles from the write rather than a refetch (D45).
 */
export async function setTaskFrequency(
  groupId: string,
  taskId: string,
  days: number | null,
): Promise<{ frequency: number | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    `rpc.set_task_frequency (${days ?? "clear"})`,
    supabase.rpc("set_task_frequency", {
      p_task: taskId,
      p_days: days as number,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { frequency: null, error: error.message };

  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { frequency: data, error: null };
}

export async function setTaskGoal(
  groupId: string,
  taskId: string,
  target: number | null,
): Promise<{ goal: number | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    `rpc.set_task_goal (${target ?? "clear"})`,
    // `p_target` is nullable in SQL (NULL clears), but the generated types
    // render every RPC arg as non-null, so the null case needs the cast. The
    // behaviour is pinned in pgTAP 009, not assumed here.
    supabase.rpc("set_task_goal", {
      p_task: taskId,
      p_target: target as number,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { goal: null, error: error.message };

  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { goal: data, error: null };
}

/**
 * Add a task I carry alone, in a circle I belong to (D70, 0036).
 *
 * Every rule lives in `add_personal_task`: membership, the non-empty name, the
 * bounds the table already keeps, and — the one that matters — that
 * `personal_for` is set to the CALLER and to nobody else. `authenticated` holds
 * no write grant on that column, so this action could not lie about whose task
 * it is even if it tried to.
 *
 * Returns the inserted row so the dialog can append it without a refetch
 * (`addTask`'s contract, CET-30 / D45) — the member has just typed it and must
 * see it land.
 *
 * `GROUP_WRITE_PATHS` rather than `/today` alone: a new task changes what the
 * member owes today, so their rings, the group screen's task list and the
 * progress grids are all now stale.
 */
export async function addPersonalTask(
  groupId: string,
  input: { label: string; subtitle: string; target: number; frequency: number },
): Promise<{ task: PersonalTaskRow | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.add_personal_task",
    supabase.rpc("add_personal_task", {
      p_group: groupId,
      p_label: input.label,
      p_subtitle: input.subtitle,
      p_target: input.target,
      p_frequency: input.frequency,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { task: null, error: error.message };

  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { task: data as PersonalTaskRow, error: null };
}

/** What `add_personal_task` hands back — the `tasks` row it just wrote. */
export type PersonalTaskRow = {
  id: string;
  label: string;
  subtitle: string | null;
  target_count: number;
  frequency_days: number;
  personal_for: string | null;
};

/**
 * Change a task I added for myself (D70).
 *
 * A plain UPDATE, gated by `tasks_update_admin_or_own_personal` (0036): the
 * policy lets the member through only for a row whose `personal_for` is theirs.
 * `personal_for` and `group_id` carry no update grant at all, so this cannot
 * move the task between circles or hand it to somebody else however it is
 * called.
 *
 * The bounds are the TABLE's — `target_count > 0`, `frequency_days between 1
 * and 14` — so a bad value is a constraint violation rather than a silent
 * write. They are checked here first only so the member reads a sentence.
 *
 * Raising the target re-judges TODAY and today alone, exactly as an admin's
 * raise does (0024): every completed past day is measured against the target
 * that day asked for, and is untouched.
 */
export async function updatePersonalTask(
  groupId: string,
  taskId: string,
  input: { label: string; subtitle: string; target: number; frequency: number },
): Promise<{ error: string | null }> {
  const label = input.label.trim();
  if (!label) return { error: "A name is required" };
  if (!Number.isFinite(input.target) || input.target < 1)
    return { error: "The target must be at least 1" };
  if (
    !Number.isFinite(input.frequency) ||
    input.frequency < 1 ||
    input.frequency > MAX_FREQUENCY_DAYS
  )
    return {
      error: `How often must be between 1 and ${MAX_FREQUENCY_DAYS} days`,
    };

  const supabase = await createClient();
  const { error } = await q(
    "tasks.update (my own personal task)",
    supabase
      .from("tasks")
      .update({
        label,
        subtitle: input.subtitle.trim() || null,
        target_count: input.target,
        frequency_days: input.frequency,
      })
      .eq("id", taskId),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { error: null };
}

/**
 * Remove a task I added for myself (D70).
 *
 * A plain DELETE, gated by `tasks_delete_admin_or_own_personal` (0036) rather
 * than by anything here: the policy is what decides, and it lets the member
 * through only for a row whose `personal_for` is theirs, in a circle they are
 * still in. Passing another task's id gets nothing deleted and no error, which
 * is RLS behaving normally and is why the client reconciles by id.
 */
export async function deletePersonalTask(
  groupId: string,
  taskId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "tasks.delete (my own personal task)",
    supabase.from("tasks").delete().eq("id", taskId),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  for (const sub of GROUP_WRITE_PATHS) revalidatePath(groupHref(groupId, sub));
  return { error: null };
}

/**
 * Declare two of my tasks to be ONE ACT (D64) — the same dhikr, asked for by two
 * circles, done once and logged once.
 *
 * Lives beside `setTaskGoal` because that is where the member meets it (D66):
 * the offer and the link both sit on a task's own row in "My goals", so the
 * action belongs to the same screen rather than to /profile, which no longer
 * carries the feature.
 *
 * A thin wrapper over `link_tasks`: the RPC is the only write path into
 * `member_task_links` and holds every rule worth holding — membership of both
 * circles, the same-circle refusal, the cluster merge and the ten-task ceiling.
 * None of that could be enforced by a direct insert, which is why the table is
 * select-only to clients.
 *
 * The server's messages are passed through UNCHANGED. "those two tasks are in
 * the same circle" is already the sentence a member needs, and rewording it here
 * would put a second copy of the rule in a file that does not own it.
 */
export async function linkTasks(
  taskA: string,
  taskB: string,
): Promise<{ error: string | null; clusterId?: string }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.link_tasks",
    supabase.rpc("link_tasks", { p_task_a: taskA, p_task_b: taskB }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  // The whole tree, not this circle's paths. A link changes what a TAP does in
  // ANOTHER circle — the count screen there names it, and Today's numbers move
  // in a circle the member may not be looking at. `GROUP_WRITE_PATHS` for the
  // circle in hand would leave the far circle stale until something else
  // happened to bust it. Linking is a once-in-a-while write, so the wide
  // revalidate costs essentially nothing (`updateName`'s argument).
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
 * remove. They reach it from the row of whichever task in the cluster they can
 * still open.
 */
export async function unlinkTask(
  taskId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.unlink_task",
    supabase.rpc("unlink_task", { p_task: taskId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { error: null };
}
