import Link from "next/link";
import { Card } from "@/components/ui";
import { FlagIcon, ChevronRightIcon } from "@/components/app/icons";
import { groupHref } from "@/lib/group-href";
import { programmeWindow } from "@/lib/roadmap";

/**
 * The way into the roadmap, from Progress.
 *
 * Deliberately carries NO figure. The obvious card would show "N of M items
 * complete" — and then the same fraction would live on two screens, computed
 * from two queries, free to disagree the moment one of them is scoped slightly
 * differently. This app has already paid for that once (Today and Group reading
 * the same circle at two different percentages, §4). The card's job is to be
 * FOUND; the numbers live on the screen it opens.
 *
 * Placed on Progress rather than in the nav: Progress is the longitudinal
 * screen, and a year-long programme is the most longitudinal thing in the app.
 * Whether it earns a fifth tab is STATUS §2 Q7 — open, and this is the
 * reversible half of it.
 */
export function RoadmapEntryCard({
  groupId,
  name,
  startsOn,
  endsOn,
  todayISO,
}: {
  groupId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  /** The member's own today (D34) — the window is counted on their calendar. */
  todayISO: string;
}) {
  // Not a bare countdown: `daysLeft` bottoms out at 0, so a programme that
  // closed years ago said "0 days left" indefinitely — indistinguishable from
  // its final day. The state is the thing worth carrying here (D34).
  const phase = programmeWindow(startsOn, endsOn, todayISO);

  return (
    <Card padding="none">
      <Link
        href={groupHref(groupId, "/roadmap")}
        className="flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-surface-hover active:bg-surface-active"
      >
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-800">
          <FlagIcon aria-hidden className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The circle&rsquo;s programme ·{" "}
            {phase.state === "closed"
              ? "closed"
              : phase.state === "upcoming"
                ? `opens in ${phase.days.toLocaleString()} day${phase.days === 1 ? "" : "s"}`
                : `${phase.days.toLocaleString()} day${phase.days === 1 ? "" : "s"} left`}
          </p>
        </div>
        <ChevronRightIcon
          aria-hidden
          className="size-5 shrink-0 text-muted-foreground"
        />
      </Link>
    </Card>
  );
}
