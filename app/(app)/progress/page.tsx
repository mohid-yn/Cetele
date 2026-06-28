"use client";

import * as React from "react";
import { Card, CardContent, Badge } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { TaskBreakdownGrid } from "@/components/demo/task-breakdown-grid";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { BadgesGrid } from "@/components/demo/badges";
import { FlameIcon, ShieldIcon } from "@/components/demo/icons";
import { useAnimatedNumber } from "@/components/demo/use-animated-number";

/** Small labelled metric used across the consistency views. */
function Score({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export default function ProgressPage() {
  const { state } = useMock();
  const me = sel.currentUser(state);
  const group = sel.activeGroup(state);
  const streak = sel.streak(state, me.id);

  // Heavy-ish derived data — memoise so the realtime ticker doesn't recompute it.
  // D28: 30-day is the personal steadfastness window (7-day was noisy, 90-day
  // duplicated it — streak covers momentum); 90-day survives only as the group
  // collective North Star (PRD §9). 14-day lives in the grid below.
  // (Admin member-oversight lives under Group → Members, not on this personal tab.)
  const { c30, groupC90 } = React.useMemo(() => {
    return {
      c30: sel.consistency(state, me.id, group.id, 30),
      groupC90: sel.groupConsistency(state, group.id, 90),
    };
  }, [state, me.id, group.id]);

  // Count-up on first paint so the page feels alive, not a static dashboard.
  const c30Shown = useAnimatedNumber(c30, 700, true);
  const groupShown = useAnimatedNumber(groupC90, 800, true);

  // GLANCE headline (abstraction rule): one warm, human takeaway up top.
  const daysComplete30 = Math.round((c30 / 100) * 30);
  const tone =
    c30 >= 80
      ? "steadfast, mashaAllah"
      : c30 >= 50
        ? "a strong rhythm — keep building"
        : c30 >= 25
          ? "you're finding your rhythm"
          : "every day is a fresh start";
  // The 30-day band abstracts the % into a calm word, not a raw grade (research §C).
  const bandWord =
    c30 >= 80
      ? "Steadfast"
      : c30 >= 50
        ? "Steady"
        : c30 >= 25
          ? "Building"
          : "Fresh start";

  return (
    <div className="rise-in flex flex-col gap-5 px-4 pt-5 pb-6">
      <PageHeader
        title="Progress"
        subtitle={
          <span className="text-balance">
            You&apos;ve fully completed{" "}
            <span className="font-semibold text-foreground">
              {daysComplete30} of the last 30 days
            </span>{" "}
            — {tone}.
          </span>
        }
      />

      {/* Streak hero — the motivational anchor (moved here from Profile) */}
      <Card className="bg-primary p-5 text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-foreground/10">
            <FlameIcon className="size-8 text-accent" />
          </div>
          <div>
            <p className="font-display text-4xl font-bold tabular-nums">
              {streak?.current ?? 0}
            </p>
            <p className="text-sm text-primary-foreground/70">day streak</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-display text-2xl font-bold tabular-nums">
              {streak?.longest ?? 0}
            </p>
            <p className="text-xs text-primary-foreground/70">longest</p>
          </div>
        </div>
      </Card>

      {/* Never miss twice — forgiveness (moved here from Profile) */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success-500/15 text-success">
            <ShieldIcon className="size-5" />
          </div>
          <div className="flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Never miss twice
              <Badge variant="success" size="sm">
                {streak?.freezesLeft ?? 0} freeze
                {(streak?.freezesLeft ?? 0) === 1 ? "" : "s"} left
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Miss a day and a streak-freeze keeps your streak alive — once. The
              point is to come back, not to be perfect.
            </p>
          </div>
        </div>
      </Card>

      {/* Personal — one 30-day steadfastness band + the last-14-days task grid */}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          {/* D28: a single abstracted 30-day band replaces the 7/30/90 trio. */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">
                {bandWord}
              </span>
              <span className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
                {c30Shown}%
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]"
                style={{ width: `${c30Shown}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {daysComplete30} of the last 30 days fully completed
            </p>
          </div>

          <div>
            <SectionHeading>Last 14 days · task by task</SectionHeading>
            <p className="mb-3 text-xs text-muted-foreground">
              Each row is a task; tap any square to see or correct that
              day&rsquo;s count.
            </p>
            {/* Your own record — editable so you can correct it (D29). */}
            <TaskBreakdownGrid
              userId={me.id}
              groupId={group.id}
              days={14}
              editable
            />
          </div>
        </CardContent>
      </Card>

      {/* Achievement badges (CET-20) — moved here from Profile */}
      <BadgesGrid />

      {/* Group collective rollup — shown to everyone (the North Star, visible) */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div>
            <Score label="Group · 90 days" value={`${groupShown}%`} />
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              The circle&rsquo;s collective consistency. Goal:{" "}
              <span className="font-semibold text-foreground">70%+</span>{" "}
              together over 90 days — showing up, not perfection.
            </p>
          </div>
          <div
            className="grid size-16 shrink-0 place-items-center rounded-full text-lg font-bold text-primary tabular-nums"
            style={{
              background: `conic-gradient(var(--primary) ${groupShown * 3.6}deg, var(--muted) 0)`,
            }}
            aria-hidden
          >
            <span className="grid size-12 place-items-center rounded-full bg-card">
              {groupShown}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
