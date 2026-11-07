import { subtreeCircleCounts } from "@/lib/reach";
import type { TreeBranch } from "../steward";
import type { BranchOption } from "./camp-form";

/**
 * The branch a camp or halaqah belongs to, with how many circles it reaches
 * (D80, D85): the branch and everything inside it. Null when the viewer does
 * not run it, which the pages turn into a trip back to their branches.
 */
export function branchOption(
  tree: TreeBranch[],
  id: string | null | undefined,
): BranchOption | null {
  const b = tree.find((x) => x.id === id);
  if (!b) return null;
  return {
    id: b.id,
    label: b.name,
    name: b.name,
    circles: subtreeCircleCounts(tree).get(b.id) ?? 0,
  };
}
