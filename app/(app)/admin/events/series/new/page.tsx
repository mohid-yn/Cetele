import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { BackLink, FormHeader } from "../../form-header";
import { loadStewardTree, requireSteward } from "../../../steward";
import { SeriesForm } from "../../series-form";
import { branchOption } from "../../branch-options";

/**
 * Start a weekly halaqah (D80) from inside a branch (D85). Set it once: each
 * week becomes its own session, with its own polls and questions.
 */
export default async function NewSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch: branchId } = await searchParams;
  const { supabase, timezone } = await requireSteward();
  const branch = branchOption(await loadStewardTree(supabase), branchId);
  if (!branch) redirect("/admin/branches");

  return (
    <Screen>
      <BackLink href={`/admin/branches/${branch.id}`} label={branch.name} />
      <FormHeader title="Weekly halaqah" branch={branch} />
      <SeriesForm branch={branch} initial={null} defaultZone={timezone} />
    </Screen>
  );
}
