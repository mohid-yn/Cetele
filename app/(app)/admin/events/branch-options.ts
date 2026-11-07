import { subtreeCircleCounts } from "@/lib/reach";
import type { TreeBranch } from "../steward";
import type { BranchOption } from "./camp-form";

/**
 * The tree as picker labels, each with its full path inside what the viewer
 * runs ("Melbourne › South East"), so two "North"s in different cities differ.
 * Each carries how many circles an event posted there reaches (D80): the
 * branch and everything inside it.
 */
export function branchOptions(tree: TreeBranch[]): BranchOption[] {
  const byId = new Map(tree.map((b) => [b.id, b]));
  const reach = subtreeCircleCounts(tree);
  return tree.map((b) => {
    const names = [b.name];
    for (
      let p = byId.get(b.parentId ?? "");
      p;
      p = byId.get(p.parentId ?? "")
    ) {
      names.unshift(p.name);
    }
    return {
      id: b.id,
      label: names.join(" › "),
      name: b.name,
      circles: reach.get(b.id) ?? 0,
    };
  });
}
