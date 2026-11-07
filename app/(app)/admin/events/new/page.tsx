import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { BackLink, FormHeader } from "../form-header";
import { loadStewardTree, requireSteward } from "../../steward";
import { CampForm } from "../camp-form";
import { branchOption } from "../branch-options";

/**
 * Post a camp (D80) from inside a branch (D85). The branch comes from where
 * the steward started, `?branch=`, so the form never asks; without one there
 * is nowhere to post it, and they go back to choose a branch.
 */
export default async function NewCampPage({
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
      <FormHeader title="New camp" branch={branch} />
      <CampForm branch={branch} initial={null} defaultZone={timezone} />
    </Screen>
  );
}
