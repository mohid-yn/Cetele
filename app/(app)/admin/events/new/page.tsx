import Link from "next/link";
import { Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon } from "@/components/app/icons";
import { loadStewardTree, requireSteward } from "../../steward";
import { CampForm } from "../camp-form";
import { branchOptions } from "../branch-options";

/** Post a camp (D80). It starts as a draft unless published straight away. */
export default async function NewCampPage() {
  const { supabase, timezone } = await requireSteward();
  const tree = await loadStewardTree(supabase);

  return (
    <Screen>
      <Link
        href="/admin/events"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Events
      </Link>
      <PageHeader eyebrow="Administration" title="New camp" />
      {tree.length > 0 ? (
        <CampForm
          branches={branchOptions(tree)}
          initial={null}
          defaultZone={timezone}
        />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          Create a branch first. A camp is posted to a branch.
        </Card>
      )}
    </Screen>
  );
}
