"use client";

import { Card, CardContent, Badge } from "@/components/ui";
import { PageHeader } from "@/components/demo/page-header";
import { SectionHeading } from "@/components/demo/section-heading";
import { FlameIcon, ShieldIcon } from "@/components/demo/icons";
import { TaskGrid, type GridRow } from "@/components/app/task-grid";

/**
 * Client leaf for the server-first Progress (M5). Streak hero +
 * never-miss-twice + the editable last-14-days grid (self-correct, D29). Data
 * arrives as props; the grid writes through the `setCount` action.
 */
export function ProgressClient({
  current,
  longest,
  freezesLeft,
  daysFull,
  days,
  rows,
  viewerId,
  names,
  hasTasks,
}: {
  current: number;
  longest: number;
  freezesLeft: number;
  daysFull: number;
  days: number;
  rows: GridRow[];
  viewerId: string;
  names: Record<string, string>;
  hasTasks: boolean;
}) {
  const tone =
    daysFull >= days * 0.8
      ? "steadfast, mashaAllah"
      : daysFull >= days * 0.4
        ? "a strong rhythm — keep building"
        : daysFull > 0
          ? "you're finding your rhythm"
          : "every day is a fresh start";

  return (
    <div className="rise-in flex flex-col gap-5 px-4 pt-5 pb-6">
      <PageHeader
        title="Progress"
        subtitle={
          <span className="text-balance">
            You&apos;ve fully completed{" "}
            <span className="font-semibold text-foreground">
              {daysFull} of the last {days} days
            </span>{" "}
            — {tone}.
          </span>
        }
      />

      {/* Streak hero — the motivational anchor */}
      <Card className="bg-primary p-5 text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-foreground/10">
            <FlameIcon className="size-8 text-accent" />
          </div>
          <div>
            <p className="font-display text-4xl font-bold tabular-nums">
              {current}
            </p>
            <p className="text-sm text-primary-foreground/70">day streak</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-display text-2xl font-bold tabular-nums">
              {longest}
            </p>
            <p className="text-xs text-primary-foreground/70">longest</p>
          </div>
        </div>
      </Card>

      {/* Never miss twice — forgiveness */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success-500/15 text-success">
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
              Miss a day and a streak-freeze keeps your streak alive — once. The
              point is to come back, not to be perfect.
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
    </div>
  );
}
