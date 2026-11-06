"use server";

import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";
import { signOutIfStaleSession } from "@/lib/stale-session";
import { refreshShell } from "./branch-refresh";

/**
 * A circle's branch (D79), from its admin's side. The RPCs gate on
 * `is_group_admin`; these relay.
 */

export async function requestBranch(
  groupId: string,
  branchId: string,
): Promise<{ error: string | null; outcome: "joined" | "requested" | null }> {
  const supabase = await createClient();
  const { data, error } = await q(
    "rpc.request_branch",
    supabase.rpc("request_branch", { p_group: groupId, p_branch: branchId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message, outcome: null };
  refreshShell(groupId);
  return { error: null, outcome: data === "joined" ? "joined" : "requested" };
}

export async function cancelBranchRequest(
  groupId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.cancel_branch_request",
    supabase.rpc("cancel_branch_request", { p_group: groupId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  refreshShell(groupId);
  return { error: null };
}

export async function leaveBranch(
  groupId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await q(
    "rpc.leave_branch",
    supabase.rpc("leave_branch", { p_group: groupId }),
  );
  await signOutIfStaleSession(error);
  if (error) return { error: error.message };
  refreshShell(groupId);
  return { error: null };
}
