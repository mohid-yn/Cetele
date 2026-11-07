/**
 * How things reach circles through the branch tree (D79, D80, D81).
 *
 * The rule, one sentence, used on every screen that explains it: something set
 * on a branch reaches every circle in that branch and every branch inside it.
 * Events always work this way; roadmaps can (D81), or go to single circles.
 *
 * Pure, so the unit suite pins it. The authority is the database
 * (`private.branch_lineage`, `private.sync_branch_roadmaps`); these helpers
 * only lay out what the screens show.
 */

export type ReachBranch = {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  /** Circles sitting directly in this branch, not its children. */
  circles: number;
};

/**
 * Circles in each branch's whole subtree. The tree arrives flattened in
 * depth-first order (`my_steward_tree`), but this does not rely on it.
 */
export function subtreeCircleCounts(
  branches: readonly ReachBranch[],
): Map<string, number> {
  const out = new Map<string, number>();
  const byId = new Map(branches.map((b) => [b.id, b]));
  for (const b of branches) {
    let cur: ReachBranch | undefined = b;
    let guard = 0;
    while (cur && guard++ < 64) {
      out.set(cur.id, (out.get(cur.id) ?? 0) + b.circles);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (!out.has(b.id)) out.set(b.id, 0);
  }
  return out;
}

/**
 * The branch and every ancestor, nearest first: the places whose events and
 * roadmaps reach a circle sitting in `branchId`. Unknown ids end the walk.
 */
export function lineage(
  branches: readonly Pick<ReachBranch, "id" | "parentId">[],
  branchId: string | null,
): string[] {
  const byId = new Map(branches.map((b) => [b.id, b]));
  const out: string[] = [];
  let cur = branchId ? byId.get(branchId) : undefined;
  while (cur && out.length < 64) {
    out.push(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}
