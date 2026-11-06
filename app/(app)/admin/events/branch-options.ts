import type { TreeBranch } from "../steward";
import type { BranchOption } from "./camp-form";

/**
 * The tree as picker labels, each with its full path inside what the viewer
 * runs ("Melbourne › South East"), so two "North"s in different cities differ.
 */
export function branchOptions(tree: TreeBranch[]): BranchOption[] {
  const byId = new Map(tree.map((b) => [b.id, b]));
  return tree.map((b) => {
    const names = [b.name];
    for (
      let p = byId.get(b.parentId ?? "");
      p;
      p = byId.get(p.parentId ?? "")
    ) {
      names.unshift(p.name);
    }
    return { id: b.id, label: names.join(" › ") };
  });
}
