"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import { groupHref, GROUP_WRITE_PATHS } from "@/lib/group-href";
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
