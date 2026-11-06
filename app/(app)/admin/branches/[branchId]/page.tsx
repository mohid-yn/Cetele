import Link from "next/link";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { loadStewardTree, requireSteward } from "../../steward";
import { BranchDetail } from "./branch-detail";

/**
 * One branch (D79): circles waiting to join, the circles in it, the branches
 * inside it, and who runs it.
 *
 * A steward learns each circle's NAME and SIZE and nothing else (D27). The
 * branch is how invitations reach a circle, not a window into it.
 */
export default async function BranchPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const { supabase, me, isOrganiser } = await requireSteward();
  const tree = await loadStewardTree(supabase);
  const branch = tree.find((b) => b.id === branchId);
  if (!branch) redirect("/admin/branches");

  const [{ data: circleRows }, { data: stewardRows }] = await Promise.all([
    q("branch.circles", supabase.rpc("branch_circles", { p_branch: branchId })),
    q(
      "branch.stewards",
      supabase.rpc("list_branch_stewards", { p_branch: branchId }),
    ),
  ]);

  // The path back up, as far as the viewer runs it.
  const trail: { id: string; name: string }[] = [];
  for (
    let at = tree.find((b) => b.id === branch.parentId);
    at;
    at = tree.find((b) => b.id === at!.parentId)
  ) {
    trail.unshift({ id: at.id, name: at.name });
  }
  const children = tree.filter((b) => b.parentId === branchId);
  // Deleting needs the right to run the branch above (or the organiser role).
  const canDelete = isOrganiser || trail.length > 0;

  return (
    <Screen>
      <Link
        href={
          trail.length
            ? `/admin/branches/${trail.at(-1)!.id}`
            : "/admin/branches"
        }
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {trail.length ? trail.at(-1)!.name : "Branches"}
      </Link>
      <PageHeader
        eyebrow={trail.map((t) => t.name).join(" › ") || "Branch"}
        title={branch.name}
      />
      <BranchDetail
        me={me}
        branch={{ id: branch.id, name: branch.name, parentId: branch.parentId }}
        canDelete={canDelete}
        subBranches={children.map((c) => ({
          id: c.id,
          name: c.name,
          circles: c.circles,
          pending: c.pending,
        }))}
        circles={(circleRows ?? []).map((c) => ({
          groupId: c.group_id,
          name: c.name,
          members: c.members,
          pending: c.pending,
        }))}
        stewards={(stewardRows ?? []).map((s) => ({
          userId: s.user_id,
          name: s.name,
          email: s.email,
        }))}
      />
    </Screen>
  );
}
