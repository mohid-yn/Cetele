"use client";

/**
 * Linked tasks — one act, counted in every circle that asked for it (D64).
 *
 * A member in three circles that all carry salawat does the dhikr ONCE. This is
 * where they say so: a link is their claim that circle A's task and circle B's
 * task are the same act, after which a tap in either lands in both.
 *
 * ON /profile, NOT ON A CIRCLE'S SCREEN. A link spans circles, so it cannot live
 * inside one without that circle pretending to own it — and it is the member's
 * alone, invisible to every admin (0034's own-row RLS). Its neighbour here is
 * reminders, for the same reason (D62).
 *
 * WHAT THIS SCREEN MUST KEEP STRAIGHT, because the migration is careful about it
 * and a screen that blurred it would make the feature a lie:
 *
 *   * the RAW COUNT travels, the COMPLETION does not. Circle A asks 1 and circle
 *     B asks 500; logging 1 closes A and leaves B at 1-of-500, which is true.
 *   * each circle goes on judging its own task by its own target and its own
 *     share. Linking changes what a TAP does, never what a circle asks for.
 *
 * SUGGESTIONS ONLY, NEVER AUTOMATIC. Nothing here links anything until the
 * member presses Link. `lib/task-links.ts` decides which pairs are offered; the
 * member decides which are true.
 */

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LinkIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { langOf } from "@/lib/text-direction";
import type { Suggestion } from "@/lib/task-links";
import { linkTasks, unlinkTask } from "@/app/(app)/profile/actions";

/** One task inside a cluster. `label`/`groupName` are NULL when the member has
 *  left that circle — `tasks_select_member` will not show them a task there, so
 *  the name is genuinely unknown rather than withheld. */
export type LinkedTask = {
  taskId: string;
  label: string | null;
  groupName: string | null;
  /** In a circle the member has left. The link survives (0019's rule) and stops
   *  fanning out; this is the state that gives them a control to clear it. */
  dormant: boolean;
};

/** A set of tasks the member performs as a single act. */
export type LinkCluster = { clusterId: string; tasks: LinkedTask[] };

export function TaskLinks({
  clusters,
  suggestions,
  multiCircle,
}: {
  clusters: LinkCluster[];
  suggestions: Suggestion[];
  /** Is the member in more than one circle at all? */
  multiCircle: boolean;
}) {
  const nothingYet = clusters.length === 0 && suggestions.length === 0;

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Linked tasks
      </h2>
      <p className="text-xs text-muted-foreground">
        When two circles ask for the same dhikr, link them and do it once — a
        tap counts in both. Each circle still asks for its own amount.
      </p>

      {nothingYet ? (
        <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {multiCircle
            ? "Nothing linked yet. When two of your circles ask for the same thing under a similar name, it'll be offered here."
            : "You're in one circle, so there's nothing to link yet — a link always joins two circles."}
        </p>
      ) : (
        <>
          {clusters.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {clusters.map((c) => (
                <ClusterCard key={c.clusterId} cluster={c} />
              ))}
            </ul>
          )}

          {suggestions.length > 0 && (
            <>
              <h3 className="mt-4 mb-1 text-xs font-semibold text-foreground">
                These look like the same thing
              </h3>
              <ul className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <SuggestionCard
                    key={`${s.a.taskId}:${s.b.taskId}`}
                    suggestion={s}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** A task's name and the circle it belongs to — the one phrasing, so a cluster
 *  row and a suggestion row can never describe the same task differently. */
function TaskLine({
  label,
  groupName,
  dormant,
}: {
  label: string | null;
  groupName: string | null;
  dormant: boolean;
}) {
  if (dormant) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">
          A task in a circle you&apos;ve left
        </p>
        <p className="text-xs text-muted-foreground">
          Not counted any more — remove it whenever you like
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p
        className="truncate text-sm font-medium text-foreground"
        dir="auto"
        lang={langOf(label ?? "")}
      >
        {label}
      </p>
      <p className="truncate text-xs text-muted-foreground">{groupName}</p>
    </div>
  );
}

/**
 * One cluster — "these are one act" — with a Remove on each task.
 *
 * Remove is per TASK rather than per cluster, because that is the operation
 * `unlink_task` performs and because it is the one a member of three circles
 * actually wants: leaving two of them joined while dropping the third. A cluster
 * that falls to one task dissolves itself in the RPC, so removing either side of
 * a pair clears the whole thing without the screen having to know that rule.
 */
function ClusterCard({ cluster }: { cluster: LinkCluster }) {
  return (
    <li>
      <Card className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <LinkIcon className="size-4 shrink-0" />
          <p className="text-xs font-medium">
            {cluster.tasks.length === 2
              ? "One act, two circles"
              : `One act, ${cluster.tasks.length} circles`}
          </p>
        </div>
        <ul className="mt-1.5 divide-y divide-border border-t border-border">
          {cluster.tasks.map((t) => (
            <TaskRow key={t.taskId} task={t} />
          ))}
        </ul>
      </Card>
    </li>
  );
}

function TaskRow({ task }: { task: LinkedTask }) {
  const act = useAction();

  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        // The dormant row recedes by SURFACE rather than opacity, so the
        // sentence explaining WHY it is inert stays readable — the rule
        // `ReminderRow` records one section up.
        task.dormant && "-mx-3 bg-muted/60 px-3",
      )}
    >
      <TaskLine
        label={task.label}
        groupName={task.groupName}
        dormant={task.dormant}
      />
      <div className="shrink-0 text-right">
        <button
          type="button"
          // "Remove" alone is what a sighted member needs, sitting under the
          // name it applies to. Out of that context — a screen reader running
          // the controls of a page with several of them — it says nothing about
          // WHICH link is about to go.
          aria-label={
            task.label
              ? `Unlink ${task.label}`
              : "Unlink a task in a circle you have left"
          }
          disabled={act.pending}
          onClick={() => act.run(() => unlinkTask(task.taskId))}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-danger disabled:cursor-not-allowed"
        >
          {act.pending ? "Removing…" : "Remove"}
        </button>
        {act.error && (
          <p role="alert" className="mt-0.5 text-xs text-danger">
            {act.error}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * A pair worth offering. Two names, the circles they came from, and one Link.
 *
 * Both names are shown in full rather than reduced to the matched word: the
 * matcher decided these are probably the same act, and the member is the one who
 * decides whether they are. Hiding what it matched on would make an offer
 * impossible to judge.
 */
function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const act = useAction();
  const { a, b } = suggestion;

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TaskLine label={a.label} groupName={a.groupName} dormant={false} />
          <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
          <TaskLine label={b.label} groupName={b.groupName} dormant={false} />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          // Same argument as Unlink: the pair is only implied by position.
          aria-label={`Link ${a.label} with ${b.label}`}
          disabled={act.pending}
          onClick={() => act.run(() => linkTasks(a.taskId, b.taskId))}
        >
          {act.pending ? "Linking…" : "Link"}
        </Button>
      </div>
      {act.error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {act.error}
        </p>
      )}
    </li>
  );
}
