import type { TreeBranch } from "../steward";

export type Destination = { id: string; label: string };

/**
 * Live branches the viewer runs, each labelled with its path inside what they
 * run ("Melbourne › South"), leaving out `exclude` and, when `excludeSubtree`
 * is set, everything inside it (a branch cannot move inside itself, 0047).
 * The picker for moving a circle or a branch (D87).
 */
export function branchDestinations(
  tree: TreeBranch[],
  exclude: string,
  excludeSubtree = false,
): Destination[] {
  const byId = new Map(tree.map((b) => [b.id, b]));
  const inside = (id: string): boolean => {
    for (let b = byId.get(id); b; b = byId.get(b.parentId ?? "")) {
      if (b.id === exclude) return true;
    }
    return false;
  };
  return tree
    .filter((b) => b.live && b.id !== exclude)
    .filter((b) => !excludeSubtree || !inside(b.id))
    .map((b) => {
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
