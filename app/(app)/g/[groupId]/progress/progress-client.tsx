"use client";

import {
  Badge,
  Card,
  CardContent,
  HeroCard,
  HeroChip,
  ProgressBar,
  Screen,
} from "@/components/ui";
import { PageHeader } from "@/components/app/page-header";
import { SectionHeading } from "@/components/app/section-heading";
import { BadgesGrid, type EarnedBadge } from "@/components/app/badges";
import { FlameIcon, ShieldIcon } from "@/components/app/icons";
import { TaskGrid, type GridRow } from "@/components/app/task-grid";

/**
 * Client leaf for the server-first Progress (M5). Streak hero +
 * never-miss-twice + the editable last-14-days grid (self-correct, D29). Data
 * arrives as props; the grid writes through the `setCount` action.
 */
/** A calm word for the 30-day band (D28 — abstract the number, don't grade). */
function bandWord(pct: number): string {
  if (pct >= 80) return "Steadfast";
  if (pct >= 60) return "Steady";
  if (pct >= 40) return "Building";
  if (pct >= 20) return "Finding your rhythm";
  return "Fresh start";
}

export function ProgressClient({
  current,
  longest,
  freezesLeft,
  daysFull,
  days,
  band,
  bandFull,
  bandWindow,
  rows,
  viewerId,
  names,
  hasTasks,
  badges,
}: {
  current: number;
  longest: number;
  freezesLeft: number;
  daysFull: number;
  days: number;
  band: number;
  bandFull: number;
  bandWindow: number;
  rows: GridRow[];
  viewerId: string;
  names: Record<string, string>;
  hasTasks: boolean;
  /** Escalating achievement badges (CET-20) — earned ones carry a date. */
  badges: EarnedBadge[];
}) {
  const tone =
    daysFull >= days * 0.8
      ? "Steadfast, mashaAllah"
      : daysFull >= days * 0.4
        ? "A strong rhythm. Keep building"
        : daysFull > 0
          ? "You're finding your rhythm"
          : "Every day is a fresh start";

  return (
    <Screen>
      <PageHeader
        title="Progress"
        subtitle={
          <span className="text-balance">
            You&apos;ve fully completed{" "}
            <span className="font-semibold text-foreground">
              {daysFull} of the last {days} days
            </span>
            . {tone}.
          </span>
        }
      />

      {/* The streak: this screen's one number. See components/ui/hero-card.tsx. */}
      <HeroCard
        medallion={<FlameIcon className="size-4 text-primary" />}
        label="Current streak"
        stat={current.toLocaleString()}
        caption={`day${current === 1 ? "" : "s"} in a row`}
        trailing={<HeroChip>Longest {longest.toLocaleString()}</HeroChip>}
      />

      {/* 30-day consistency band (D28 — a calm word + %, from the rollup) */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Consistency · last {bandWindow} days
            </h2>
            <p className="mt-1 text-sm font-semibold text-primary">
              {bandWord(band)}
            </p>
          </div>
          <span className="font-display text-2xl font-bold text-foreground tabular-nums">
            {band}%
          </span>
        </div>
        <ProgressBar value={band} className="mt-3" />
        <p className="mt-2 text-xs text-muted-foreground">
          {bandFull} of the last {bandWindow} days fully completed.
        </p>
      </Card>

      {/* Achievements (CET-20) — earned, escalating, and permanent (D43). */}
      <BadgesGrid badges={badges} />

      {/* Never miss twice — forgiveness */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 pt-0.5 text-success">
            <ShieldIcon className="size-5" />
          </div>
          <div className="flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Never miss twice
              <Badge variant="success" size="sm">
                {freezesLeft} freeze{freezesLeft === 1 ? "" : "s"} left
              </Badge>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Miss a day and a streak-freeze keeps your streak alive, once.
            </p>
          </div>
        </div>
      </Card>

      {/* Personal last-14-days task grid (editable — self-correct, D29) */}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div>
            <SectionHeading>Last {days} days · task by task</SectionHeading>
            <p className="mb-3 text-xs text-muted-foreground">
              Each row is a task; tap any square to see or correct that
              day&rsquo;s count.
            </p>
            {hasTasks ? (
              <TaskGrid
                userId={viewerId}
                viewerId={viewerId}
                rows={rows}
                names={names}
                days={days}
                editable
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No tasks in this group yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Screen>
  );
}
