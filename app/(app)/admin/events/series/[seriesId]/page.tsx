import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { ArrowLeftIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { loadStewardTree, requireSteward } from "../../../steward";
import { Hosts, SeriesForm } from "../../series-form";
import { branchOptions } from "../../branch-options";

/** Edit a weekly halaqah and choose who hosts it (D80). */
export default async function EditSeriesPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const { supabase, timezone } = await requireSteward();
  const [tree, { data: s }, { data: hostRows }] = await Promise.all([
    loadStewardTree(supabase),
    q(
      "admin.series",
      supabase
        .from("event_series")
        .select(
          "id, branch_id, title, details, venue, weekday, start_time, duration_minutes, timezone, active",
        )
        .eq("id", seriesId)
        .maybeSingle(),
    ),
    q(
      "admin.series hosts",
      supabase.rpc("list_series_hosts", { p_series: seriesId }),
    ),
  ]);
  if (!s || !tree.some((b) => b.id === s.branch_id)) notFound();

  return (
    <Screen>
      <Link
        href="/admin/events"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeftIcon aria-hidden className="size-4" /> Events
      </Link>
      <PageHeader
        eyebrow="Weekly halaqah"
        title={s.title}
        action={s.active ? undefined : <Badge variant="neutral">Stopped</Badge>}
      />
      <SeriesForm
        branches={branchOptions(tree)}
        defaultZone={timezone}
        initial={{
          id: s.id,
          branchId: s.branch_id,
          title: s.title,
          details: s.details,
          venue: s.venue,
          weekday: s.weekday,
          startTime: s.start_time as string,
          durationMinutes: s.duration_minutes,
          timezone: s.timezone,
          active: s.active,
        }}
      />
      <Hosts
        seriesId={s.id}
        hosts={(hostRows ?? []).map((h) => ({
          userId: h.user_id,
          name: h.name,
          email: h.email,
        }))}
      />
    </Screen>
  );
}
