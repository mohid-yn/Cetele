"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";

/**
 * Branches (D79). Relays over the 0042 RPCs, which hold every rule: who runs
 * what, who may approve, what may be deleted.
 */

async function relay(
  label: string,
  call: (s: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{
    error: { message: string; code?: string } | null;
  }>,
  paths: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(label, call(supabase));
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  paths.forEach((p) => revalidatePath(p));
  // Every branch screen, its settings included: a rename or a new steward shows
  // on the branch, its parent and the home list alike (D85).
  revalidatePath("/admin/branches", "layout");
  return { error: null };
}

/** Creates a branch and opens it, so its stewards and circles are one tap away. */
export async function createBranch(
  parentId: string | null,
  name: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.create_branch",
    supabase.rpc("create_branch", {
      p_parent: parentId as string,
      p_name: name,
    }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  revalidatePath("/admin/branches");
  redirect(`/admin/branches/${data}`);
}

export async function renameBranch(branchId: string, name: string) {
  return relay(
    "rpc.rename_branch",
    (s) => s.rpc("rename_branch", { p_branch: branchId, p_name: name }),
    ["/admin/branches", `/admin/branches/${branchId}`],
  );
}

export async function deleteBranch(
  branchId: string,
  parentId: string | null,
): Promise<{ error: string | null }> {
  const res = await relay(
    "rpc.delete_branch",
    (s) => s.rpc("delete_branch", { p_branch: branchId }),
    ["/admin/branches"],
  );
  if (res.error) return res;
  redirect(parentId ? `/admin/branches/${parentId}` : "/admin/branches");
}

export async function appointSteward(branchId: string, email: string) {
  const trimmed = email.trim();
  if (!trimmed) return { error: "Enter an email address" };
  return relay(
    "rpc.appoint_steward",
    (s) => s.rpc("appoint_steward", { p_branch: branchId, p_email: trimmed }),
    [`/admin/branches/${branchId}`],
  );
}

export async function removeSteward(branchId: string, userId: string) {
  return relay(
    "rpc.remove_steward",
    (s) => s.rpc("remove_steward", { p_branch: branchId, p_user: userId }),
    [`/admin/branches/${branchId}`],
  );
}

export async function decideRequest(
  branchId: string,
  groupId: string,
  approve: boolean,
) {
  return relay(
    "rpc.decide_branch_request",
    (s) =>
      s.rpc("decide_branch_request", { p_group: groupId, p_approve: approve }),
    ["/admin/branches", `/admin/branches/${branchId}`],
  );
}

export async function removeCircle(branchId: string, groupId: string) {
  return relay(
    "rpc.leave_branch",
    (s) => s.rpc("leave_branch", { p_group: groupId }),
    ["/admin/branches", `/admin/branches/${branchId}`],
  );
}

/**
 * Move a branch under another parent, or to the top level (0047, D87). The
 * database checks the right to run both ends and refuses a move inside itself.
 */
export async function moveBranch(branchId: string, parentId: string | null) {
  return relay(
    "rpc.move_branch",
    (s) =>
      s.rpc("move_branch", {
        p_branch: branchId,
        p_parent: parentId as string,
      }),
    ["/admin/branches"],
  );
}

/** Archive or restore a branch and everything inside it (0047, D87). */
export async function setBranchArchived(branchId: string, archived: boolean) {
  return relay(
    "rpc.set_branch_archived",
    (s) =>
      s.rpc("set_branch_archived", {
        p_branch: branchId,
        p_archived: archived,
      }),
    ["/admin/branches"],
  );
}

/**
 * Move a circle between two branches the viewer runs (0047, D87). Never into
 * the circle: its members and dhikr are untouched, only where it sits changes.
 */
export async function moveCircle(groupId: string, branchId: string) {
  return relay(
    "rpc.move_circle",
    (s) => s.rpc("move_circle", { p_group: groupId, p_branch: branchId }),
    ["/admin/branches"],
  );
}
