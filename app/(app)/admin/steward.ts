import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { q } from "@/lib/db-log";

/**
 * The gate for /admin/branches and /admin/events (D79): an organiser, or a
 * steward of at least one branch. Courtesy, not security: every RPC behind
 * these screens checks `is_steward_of` itself.
 */
export async function requireSteward() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string | undefined;
  if (!me) redirect("/");

  const [{ data: viewer }, { data: stewardRows }] = await Promise.all([
    q(
      "steward.viewer (is_super_admin)",
      supabase
        .from("profiles")
        .select("is_super_admin, timezone")
        .eq("id", me)
        .maybeSingle(),
    ),
    q(
      "steward.viewer (rows)",
      supabase
        .from("branch_stewards")
        .select("branch_id")
        .eq("user_id", me)
        .limit(1),
    ),
  ]);
  const isOrganiser = viewer?.is_super_admin ?? false;
  if (!isOrganiser && (stewardRows ?? []).length === 0) redirect("/groups");

  return {
    supabase,
    me,
    isOrganiser,
    timezone: viewer?.timezone ?? "UTC",
  };
}

export type TreeBranch = {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  circles: number;
  pending: number;
  direct: boolean;
};

/** Everything the viewer runs, as one flattened, ordered tree. */
export async function loadStewardTree(
  supabase: Awaited<ReturnType<typeof requireSteward>>["supabase"],
): Promise<TreeBranch[]> {
  const { data } = await q(
    "steward.my_steward_tree",
    supabase.rpc("my_steward_tree"),
  );
  return (data ?? []).map((b) => ({
    id: b.id,
    parentId: b.parent_id,
    name: b.name,
    depth: b.depth,
    circles: b.circles,
    pending: b.pending,
    direct: b.direct,
  }));
}
