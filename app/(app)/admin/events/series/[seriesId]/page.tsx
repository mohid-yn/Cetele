import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Screen } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import { ChevronRightIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { formatWhen } from "@/lib/events";
import { BackLink, FormHeader } from "../../form-header";
import { loadStewardTree, requireSteward } from "../../../steward";
import { Hosts, SeriesForm } from "../../series-form";
import { branchOption } from "../../branch-options";

/**
 * A weekly halaqah (D80): its coming weeks first, because each session is
 * where its polls and questions are run, then its settings and hosts. Reached
 * from its branch's "Happening here" (D85).
 */
export default async function EditSeriesPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const { supabase, timezone } = await requireSteward();
  const [tree, { data: s }, { data: hostRows }, { data: sessions }] =
    await Promise.all([
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
      q(
        "admin.series sessions",
        supabase
          .from("events")
          .select("id, starts_at, ends_at, timezone, status")
          .eq("series_id", seriesId)
          .gt("ends_at", new Date().toISOString())
          .order("starts_at")
          .limit(6),
      ),
    ]);
  const branch = s ? branchOption(tree, s.branch_id) : null;
  if (!s || !branch) notFound();

  return (
    <Screen>
      <BackLink href={`/admin/branches/${branch.id}`} label={branch.name} />
      <FormHeader
        title={s.title}
        branch={branch}
        action={s.active ? undefined : <Badge variant="neutral">Stopped</Badge>}
      />

      {(sessions ?? []).length > 0 && (
        <section>
          <SectionHeading>Coming weeks</SectionHeading>
          <p className="mb-2 text-xs text-muted-foreground">
            Open a week to run its polls, read its questions or cancel it.
          </p>
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {(sessions ?? []).map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1 text-sm text-foreground">
                      {formatWhen(e.starts_at, e.ends_at, e.timezone)}
                    </span>
                    {e.status === "cancelled" && (
                      <Badge variant="danger" size="sm">
                        Cancelled
                      </Badge>
                    )}
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <SeriesForm
        branch={branch}
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
