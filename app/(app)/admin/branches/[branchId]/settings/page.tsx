import Link from "next/link";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { loadStewardTree, requireSteward } from "../../../steward";
import { BranchSettings, Stewards } from "../branch-detail";

/**
 * A branch's settings (D85): who runs it, its name, deleting it. Behind the
 * gear on the branch's page, because none of it is day-to-day: the page itself
 * is for what happens in the place.
 */
export default async function BranchSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const { supabase, me, isOrganiser } = await requireSteward();
  const tree = await loadStewardTree(supabase);
  const branch = tree.find((b) => b.id === branchId);
  if (!branch) redirect("/admin/branches");

  const { data: stewardRows } = await q(
    "branch.stewards",
    supabase.rpc("list_branch_stewards", { p_branch: branchId }),
  );
  // Deleting needs the right to run the branch above (or the organiser role).
  const canDelete = isOrganiser || tree.some((b) => b.id === branch.parentId);

  return (
    <Screen>
      <Link
        href={`/admin/branches/${branchId}`}
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {branch.name}
      </Link>
      <PageHeader title="Settings" />
      <Stewards
        me={me}
        branch={{ id: branch.id, name: branch.name }}
        stewards={(stewardRows ?? []).map((s) => ({
          userId: s.user_id,
          name: s.name,
          email: s.email,
        }))}
      />
      <BranchSettings
        branch={{ id: branch.id, name: branch.name, parentId: branch.parentId }}
        canDelete={canDelete}
      />
    </Screen>
  );
}
