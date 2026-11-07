import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import { ChevronRightIcon } from "@/components/app/icons";
import { clock, formatWhen, WEEKDAY_NAMES } from "@/lib/events";
import { AssignRoadmap } from "./assign-roadmap";

export type ReachItem = {
  kind: "roadmap" | "series" | "camp";
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  weekday: number | null;
  startTime: string | null;
  fromBranchName: string;
  inherited: boolean;
};

/**
 * HAPPENING HERE (D85): this branch's own camps, weekly halaqahs and roadmaps,
 * one list, soonest camp first. What reaches it from a branch above is not
 * badged row by row: it is one quiet line at the foot ("Also here from Youth
 * Nexus: Summer Camp"), because it is context, not something to act on here.
 *
 * Roadmaps are placed from here (owner's choice A, 2026-11-07): an organiser
 * adds one to this branch the way a steward posts a camp, by being in the place.
 */
export function HappeningHere({
  branchId,
  branchName,
  circles,
  items,
  isOrganiser,
  roadmaps,
}: {
  branchId: string;
  branchName: string;
  circles: number;
  items: ReachItem[];
  isOrganiser: boolean;
  roadmaps: { id: string; name: string; published: boolean; here: boolean }[];
}) {
  const own = items.filter((i) => !i.inherited);
  const camps = own
    .filter((i) => i.kind === "camp")
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const series = own.filter((i) => i.kind === "series");
  const maps = own.filter((i) => i.kind === "roadmap");
  const rows = [...camps, ...series, ...maps];

  // From above, grouped by the branch it comes from, nearest first as
  // `branch_reach` returns them; a roadmap set on two levels is named once.
  const above = new Map<string, string[]>();
  for (const i of items.filter((x) => x.inherited)) {
    const list = above.get(i.fromBranchName) ?? [];
    if (!list.includes(i.title)) list.push(i.title);
    above.set(i.fromBranchName, list);
  }

  return (
    <section>
      <SectionHeading
        action={
          isOrganiser ? (
            <AssignRoadmap
              branchId={branchId}
              branchName={branchName}
              circles={circles}
              roadmaps={roadmaps}
            />
          ) : undefined
        }
      >
        Happening here
      </SectionHeading>
      <Card className="overflow-hidden">
        {rows.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={
                    r.kind === "camp"
                      ? `/admin/events/${r.id}`
                      : r.kind === "series"
                        ? `/admin/events/series/${r.id}`
                        : `/programme/${r.id}`
                  }
                  className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {r.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {describe(r, circles)}
                    </span>
                  </span>
                  {(r.status === "draft" || r.status === "off") && (
                    <Badge variant="outline" size="sm">
                      {r.status === "off" ? "Off" : "Draft"}
                    </Badge>
                  )}
                  {r.status === "cancelled" && (
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
        ) : (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Nothing posted here yet.
          </p>
        )}
        {[...above].map(([from, titles]) => (
          <p
            key={from}
            className="border-t border-border bg-background px-4 py-2.5 text-xs text-muted-foreground"
          >
            Also here from {from}: {titles.join(", ")}
          </p>
        ))}
      </Card>
    </section>
  );
}

function describe(r: ReachItem, circles: number): string {
  if (r.kind === "camp")
    return `Camp · ${formatWhen(r.startsAt!, r.endsAt!, r.timezone ?? "UTC")}`;
  if (r.kind === "series") {
    const [h, m] = (r.startTime ?? "0:0").split(":").map(Number);
    return `Halaqah · ${WEEKDAY_NAMES[r.weekday ?? 0]}s at ${clock(h, m)}`;
  }
  return `Roadmap · ${circles === 1 ? "the circle here follows" : `all ${circles} circles follow`}`;
}
