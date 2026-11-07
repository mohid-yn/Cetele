import Link from "next/link";
import { Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon } from "@/components/app/icons";
import { loadStewardTree, requireSteward } from "../../../steward";
import { SeriesForm } from "../../series-form";
import { branchOptions } from "../../branch-options";

/** Start a weekly halaqah (D80). */
export default async function NewSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const { supabase, timezone } = await requireSteward();
  const tree = await loadStewardTree(supabase);
  // From a branch's page (D82): start with that branch chosen.
  const defaultBranchId = tree.some((b) => b.id === branch)
    ? branch
    : undefined;

  return (
    <Screen>
      <Link
        href="/admin/events"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Events
      </Link>
      <PageHeader
        eyebrow="Administration"
        title="Weekly halaqah"
        subtitle="Set it once. Each week becomes its own session, with its own polls and questions."
      />
      {tree.length > 0 ? (
        <SeriesForm
          branches={branchOptions(tree)}
          initial={null}
          defaultBranchId={defaultBranchId}
          defaultZone={timezone}
        />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          Create a branch first. A halaqah is posted to a branch.
        </Card>
      )}
    </Screen>
  );
}
