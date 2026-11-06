import Link from "next/link";
import { Badge, buttonVariants, Card, Screen } from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { ChevronRightIcon, PlusIcon } from "@/components/app/icons";
import { q } from "@/lib/db-log";
import { formatWhen, WEEKDAY_NAMES, clock } from "@/lib/events";
import { loadStewardTree, requireSteward } from "../steward";

/**
 * Events the viewer runs (D80): camps (drafts included) and weekly halaqahs.
 * A halaqah's weeks are listed under the event list as sessions; the series
 * itself, which is what gets edited, has its own row.
 */
export default async function AdminEventsPage() {
  const { supabase } = await requireSteward();

  const [{ data: rows }, { data: seriesRows }, tree] = await Promise.all([
    q("admin.events_i_lead", supabase.rpc("events_i_lead")),
    q(
      "admin.event_series",
      supabase
        .from("event_series")
        .select(
          "id, branch_id, title, weekday, start_time, active, branches(name)",
        )
        .order("weekday"),
    ),
    loadStewardTree(supabase),
  ]);

  const camps = (rows ?? []).filter((e) => e.kind === "camp");
  const sessions = (rows ?? [])
    .filter((e) => e.kind === "halaqah")
    .slice(0, 12);
  // RLS also returns the series a steward simply ATTENDS (their own circle's
  // branch). This screen is for what they run.
  const runs = new Set(tree.map((b) => b.id));
  const series = (seriesRows ?? []).filter((s) => runs.has(s.branch_id));

  return (
    <Screen>
      <PageHeader
        eyebrow="Administration"
        title="Events"
        subtitle="Camps and weekly halaqahs for the branches you run."
      />

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/admin/events/new"
          className={buttonVariants({ variant: "accent" })}
        >
          <PlusIcon aria-hidden className="size-4" /> New camp
        </Link>
        <Link
          href="/admin/events/series/new"
          className={buttonVariants({ variant: "tonal" })}
        >
          <PlusIcon aria-hidden className="size-4" /> Weekly halaqah
        </Link>
      </div>

      <section>
        <SectionHeading>Camps</SectionHeading>
        {camps.length > 0 ? (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {camps.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/admin/events/${e.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {e.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatWhen(e.starts_at, e.ends_at, e.timezone)} ·{" "}
                        {e.branch_name}
                      </span>
                    </span>
                    <StatusBadge status={e.status} going={e.going} />
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No camps coming up.</p>
        )}
      </section>

      <section>
        <SectionHeading>Weekly halaqahs</SectionHeading>
        {series.length > 0 ? (
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {series.map((s) => {
                const [h, m] = (s.start_time as string).split(":").map(Number);
                return (
                  <li key={s.id}>
                    <Link
                      href={`/admin/events/series/${s.id}`}
                      className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {s.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {WEEKDAY_NAMES[s.weekday]}s at {clock(h, m)} ·{" "}
                          {s.branches?.name}
                        </span>
                      </span>
                      {!s.active && (
                        <Badge variant="neutral" size="sm">
                          Off
                        </Badge>
                      )}
                      <ChevronRightIcon
                        aria-hidden
                        className="size-5 text-muted-foreground"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            No weekly halaqahs yet.
          </p>
        )}
      </section>

      {sessions.length > 0 && (
        <section>
          <SectionHeading>Next sessions</SectionHeading>
          <p className="mb-2 text-xs text-muted-foreground">
            Open a session to run its polls, read its questions or cancel that
            week.
          </p>
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border">
              {sessions.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {e.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatWhen(e.starts_at, e.ends_at, e.timezone)}
                        {e.questions > 0 &&
                          ` · ${e.questions} ${e.questions === 1 ? "question" : "questions"}`}
                      </span>
                    </span>
                    <StatusBadge status={e.status} going={e.going} />
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </Screen>
  );
}

function StatusBadge({ status, going }: { status: string; going: number }) {
  if (status === "draft")
    return (
      <Badge variant="warning" size="sm">
        Draft
      </Badge>
    );
  if (status === "cancelled")
    return (
      <Badge variant="danger" size="sm">
        Cancelled
      </Badge>
    );
  return (
    <Badge variant="success" size="sm">
      {going} going
    </Badge>
  );
}
