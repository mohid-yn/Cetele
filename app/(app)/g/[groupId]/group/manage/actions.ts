"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAX_FREQUENCY_DAYS } from "@/lib/goals";
import { ACTIVE_GROUP_COOKIE } from "@/lib/active-group";
import { groupHref } from "@/lib/group-href";

/**
 * M2 Server Actions for the manage screen. Deliberately thin: RLS + the 0007
 * grants are the authority (admin-only writes, owner-safety, column locks) —
 * these functions just validate input shape, run the statement, and
 * revalidate. A blocked write surfaces as a Postgres error (or an RLS-filtered
 * no-op), never a client-side trust decision.
 */

type Result = { error: string | null };

/** Bust the manage screen. Concrete path, never the `/g/[groupId]/…` template:
 *  a template leaves the client Router Cache holding the RSC payload the nav
 *  prefetched *before* the write, so navigating back replays stale data. */
function revalidateManage(groupId: string) {
  revalidatePath(groupHref(groupId, "/group/manage"));
}

const ok: Result = { error: null };
const fail = (message: string): Result => ({ error: message });

// ---------------------------------------------------------------------------
// Group settings
// ---------------------------------------------------------------------------

export async function renameGroup(
  groupId: string,
  name: string,
): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return fail("Group name is required");

  const supabase = await createClient();
  const { error } = await supabase
    .from("groups")
    .update({ name: trimmed })
    .eq("id", groupId);
  if (error) return fail(error.message);

  revalidateManage(groupId);
  revalidatePath("/groups");
  return ok;
}

/** Owner-only (RLS). Cascades tasks/memberships/invites; clears the cookie. */
export async function deleteGroup(groupId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) return fail(error.message);

  (await cookies()).delete(ACTIVE_GROUP_COOKIE);
  revalidatePath("/groups");
  redirect("/groups");
}

export async function transferOwnership(
  groupId: string,
  newOwnerId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", {
    p_group: groupId,
    p_new_owner: newOwnerId,
  });
  if (error) return fail(error.message);

  revalidateManage(groupId);
  revalidatePath("/groups");
  return ok;
}

/**
 * M7 (D27) — a co-admin claims a group whose owner is absent (dormant ≥14 days
 * or gone), so one owner leaving never orphans the circle. The RPC enforces
 * both the co-admin role and owner-absence, and writes the audit trail.
 */
export async function claimOwnership(groupId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_ownership", { p_group: groupId });
  if (error) return fail(error.message);

  revalidateManage(groupId);
  revalidatePath("/groups");
  return ok;
}

// ---------------------------------------------------------------------------
// Tasks (CET-5 — the admin task-list editor)
// ---------------------------------------------------------------------------

function parseTask(input: {
  label: string;
  subtitle: string;
  target: string;
  frequency?: string;
}) {
  const label = input.label.trim();
  const subtitle = input.subtitle.trim() || null;
  const target = parseInt(input.target, 10);
  if (!label) return { error: "A label is required" } as const;
  if (!Number.isFinite(target) || target < 1)
    return { error: "The target must be at least 1" } as const;
  // Frequency (0021). Capped at MAX_FREQUENCY_DAYS because raw logs are pruned
  // at 14 days (D31a) — a longer cycle could never be seen by the streak walk.
  const frequency = parseInt(input.frequency ?? "1", 10);
  if (
    !Number.isFinite(frequency) ||
    frequency < 1 ||
    frequency > MAX_FREQUENCY_DAYS
  )
    return {
      error: `How often must be between 1 and ${MAX_FREQUENCY_DAYS} days`,
    } as const;
  return { error: null, label, subtitle, target, frequency } as const;
}

/** The task row shape the manage list renders (mirrors ManageTask). */
type NewTask = {
  id: string;
  label: string;
  subtitle: string | null;
  target_count: number;
  frequency_days: number;
  sort_order: number;
};

export async function addTask(
  groupId: string,
  input: {
    label: string;
    subtitle: string;
    target: string;
    frequency?: string;
  },
): Promise<Result & { task?: NewTask }> {
  const parsed = parseTask(input);
  if (parsed.error) return fail(parsed.error);

  const supabase = await createClient();
  // Append at the end of the list.
  const { data: last } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Return the inserted row so the client can append it optimistically — the
  // manage list must not depend on a post-write refetch landing (CET-30).
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      group_id: groupId,
      label: parsed.label,
      subtitle: parsed.subtitle,
      target_count: parsed.target,
      frequency_days: parsed.frequency,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select(
      "id, label, subtitle, target_count, frequency_days, created_at, sort_order",
    )
    .single();
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return { error: null, task };
}

export async function updateTask(
  groupId: string,
  taskId: string,
  input: {
    label: string;
    subtitle: string;
    target: string;
    frequency?: string;
  },
): Promise<Result> {
  const parsed = parseTask(input);
  if (parsed.error) return fail(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      label: parsed.label,
      subtitle: parsed.subtitle,
      target_count: parsed.target,
      frequency_days: parsed.frequency,
    })
    .eq("id", taskId);
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return ok;
}

export async function deleteTask(
  groupId: string,
  taskId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return ok;
}

// ---------------------------------------------------------------------------
// Members (owner-safety lives in RLS: owner rows are untouchable here)
// ---------------------------------------------------------------------------

export async function setMemberRole(
  groupId: string,
  userId: string,
  role: "admin" | "member",
): Promise<Result> {
  if (role !== "admin" && role !== "member") return fail("Invalid role");

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return ok;
}

export async function removeMember(
  groupId: string,
  userId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return ok;
}

// ---------------------------------------------------------------------------
// Invites (D34/D35 — shareable link/code; nothing is ever emailed)
// ---------------------------------------------------------------------------

/** The invite row shape the manage list renders (mirrors ManageInvite). */
type NewInvite = {
  id: string;
  email: string | null;
  code: string;
};

/**
 * Mint a ONE-OFF invite locked to an email (single-use — accept_invite consumes
 * it). The circle's open link is not created here: every circle owns exactly
 * one from birth and it is regenerated, not re-created (0022).
 *
 * The email is REQUIRED now. Passing none used to mean "open link", and that
 * door is closed at the database too — a second `email is null` row for the
 * group violates `invites_one_default_per_group`. Refusing it here turns what
 * would surface as a raw unique-violation into a sentence.
 */
export async function createInvite(
  groupId: string,
  email: string,
): Promise<Result & { invite?: NewInvite }> {
  const locked = email.trim().toLowerCase();
  if (!locked) return fail("Enter an email to lock this invite to");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(locked))
    return fail("That doesn't look like an email address");

  const supabase = await createClient();
  // Code is DB-minted (0007 column default; clients can't write it). Role is a
  // DB default of 'member' and CHECKed to it — an invite is never a promotion
  // path (0022), so there is nothing to send. Return the inserted row so the
  // client can append it optimistically (CET-30).
  const { data: invite, error } = await supabase
    .from("invites")
    .insert({ group_id: groupId, email: locked })
    .select("id, email, code")
    .single();
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return { error: null, invite: invite as NewInvite };
}

/**
 * Revoke a one-off locked invite. The circle's open link is deliberately NOT
 * revocable — RLS filters it out of this delete, so a caller who aims at it
 * gets a silent no-op rather than an unjoinable circle. Regenerate instead.
 */
export async function revokeInvite(
  groupId: string,
  inviteId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return ok;
}

/**
 * Mint a fresh code for the circle's one open link, which kills every copy
 * already shared. This replaces revoke-and-re-create: the circle is never left
 * without a way in, and there is never a list of links to reason about.
 *
 * An RPC because `authenticated` holds no UPDATE grant on `invites` (002) —
 * the code only ever moves inside SECURITY DEFINER.
 */
export async function regenerateInvite(
  groupId: string,
): Promise<Result & { code?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_invite", {
    p_group_id: groupId,
  });
  if (error) return fail(error.message);

  revalidateManage(groupId);
  return { error: null, code: data as string };
}
