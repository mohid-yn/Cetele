"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE } from "@/lib/active-group";

/**
 * M2 Server Actions for the manage screen. Deliberately thin: RLS + the 0007
 * grants are the authority (admin-only writes, owner-safety, column locks) —
 * these functions just validate input shape, run the statement, and
 * revalidate. A blocked write surfaces as a Postgres error (or an RLS-filtered
 * no-op), never a client-side trust decision.
 */

type Result = { error: string | null };

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

  revalidatePath("/group/manage");
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

  revalidatePath("/group/manage");
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

  revalidatePath("/group/manage");
  revalidatePath("/groups");
  return ok;
}

// ---------------------------------------------------------------------------
// Tasks (CET-5 — the admin task-list editor)
// ---------------------------------------------------------------------------

function parseTask(input: { label: string; subtitle: string; target: string }) {
  const label = input.label.trim();
  const subtitle = input.subtitle.trim() || null;
  const target = parseInt(input.target, 10);
  if (!label) return { error: "A label is required" } as const;
  if (!Number.isFinite(target) || target < 1)
    return { error: "The daily target must be at least 1" } as const;
  return { error: null, label, subtitle, target } as const;
}

export async function addTask(
  groupId: string,
  input: { label: string; subtitle: string; target: string },
): Promise<Result> {
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

  const { error } = await supabase.from("tasks").insert({
    group_id: groupId,
    label: parsed.label,
    subtitle: parsed.subtitle,
    target_count: parsed.target,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return fail(error.message);

  revalidatePath("/group/manage");
  return ok;
}

export async function updateTask(
  taskId: string,
  input: { label: string; subtitle: string; target: string },
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
    })
    .eq("id", taskId);
  if (error) return fail(error.message);

  revalidatePath("/group/manage");
  return ok;
}

export async function deleteTask(taskId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return fail(error.message);

  revalidatePath("/group/manage");
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

  revalidatePath("/group/manage");
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

  revalidatePath("/group/manage");
  return ok;
}

// ---------------------------------------------------------------------------
// Invites (D34/D35 — shareable link/code; nothing is ever emailed)
// ---------------------------------------------------------------------------

export async function createInvite(
  groupId: string,
  role: "admin" | "member",
  email: string,
): Promise<Result> {
  if (role !== "admin" && role !== "member") return fail("Invalid role");
  const locked = email.trim().toLowerCase();
  if (locked && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(locked))
    return fail("That doesn't look like an email address");

  const supabase = await createClient();
  // Code is DB-minted (0007 column default; clients can't write it).
  const { error } = await supabase.from("invites").insert({
    group_id: groupId,
    role,
    email: locked || null,
  });
  if (error) return fail(error.message);

  revalidatePath("/group/manage");
  return ok;
}

export async function revokeInvite(inviteId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("invites").delete().eq("id", inviteId);
  if (error) return fail(error.message);

  revalidatePath("/group/manage");
  return ok;
}
