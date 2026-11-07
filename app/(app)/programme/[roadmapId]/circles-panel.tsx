"use client";

import * as React from "react";
import { Badge, Input } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import { BranchesIcon } from "@/components/app/icons";
import { usePropState } from "@/lib/use-prop-state";
import { subtreeCircleCounts, type ReachBranch } from "@/lib/reach";
import { setBranchOnRoadmap, setCircleOnRoadmap } from "./authoring-actions";

export type RoadmapCircle = {
  id: string;
  name: string;
  memberCount: number;
  following: boolean;
  /** Set when the circle follows because its branch was assigned (0044, D81). */
  viaBranch: string | null;
};

export type RoadmapBranch = ReachBranch & { assigned: boolean };

/**
 * Who follows this roadmap (D72, D81), in the two ways it can happen:
 *
 *   1. BRANCHES. Assign a branch and every circle in it and under it follows,
 *      including circles that join later. The same flow-down as events.
 *   2. SINGLE CIRCLES, for a circle outside any branch or one exception.
 *
 * A circle that follows through a branch is shown ticked and locked with the
 * branch's name, because unticking it would be undone by the branch anyway.
 * Rows stay in alphabetical order when toggled, so the row under a thumb never
 * moves.
 */
export function CirclesPanel({
  roadmapId,
  published,
  circles: serverCircles,
  branches: serverBranches,
}: {
  roadmapId: string;
  published: boolean;
  circles: RoadmapCircle[];
  branches: RoadmapBranch[];
}) {
  const [circles, setCircles] = usePropState(serverCircles);
  const [branches, setBranches] = usePropState(serverBranches);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busyBranch, setBusyBranch] = React.useState<string | null>(null);

  const toggle = async (circle: RoadmapCircle) => {
    const next = !circle.following;
    const flip = (value: boolean) =>
      setCircles((list) =>
        list.map((c) => (c.id === circle.id ? { ...c, following: value } : c)),
      );
    flip(next);
    setError(null);
    const res = await setCircleOnRoadmap(roadmapId, circle.id, next);
    if (res.error) {
      flip(!next);
      setError(res.error);
    }
  };

  // A branch toggle changes which circles follow, which only the server knows,
  // so the circle list waits for the refreshed props rather than guessing.
  const toggleBranch = async (branch: RoadmapBranch) => {
    const next = !branch.assigned;
    const flip = (value: boolean) =>
      setBranches((list) =>
        list.map((b) => (b.id === branch.id ? { ...b, assigned: value } : b)),
      );
    flip(next);
    setError(null);
    setBusyBranch(branch.id);
    const res = await setBranchOnRoadmap(roadmapId, branch.id, next);
    setBusyBranch(null);
    if (res.error) {
      flip(!next);
      setError(res.error);
    }
  };

  const subtreeCounts = React.useMemo(
    () => subtreeCircleCounts(branches),
    [branches],
  );
  // The assigned branch above each branch, so a child can say it is covered.
  const coveredBy = React.useMemo(() => {
    const byId = new Map(branches.map((b) => [b.id, b]));
    const out = new Map<string, string>();
    for (const b of branches) {
      let p = b.parentId ? byId.get(b.parentId) : undefined;
      while (p) {
        if (p.assigned) {
          out.set(b.id, p.name);
          break;
        }
        p = p.parentId ? byId.get(p.parentId) : undefined;
      }
    }
    return out;
  }, [branches]);

  const onCount = circles.filter((c) => c.following).length;
  const viaCount = circles.filter((c) => c.viaBranch).length;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? circles.filter((c) => c.name.toLowerCase().includes(needle))
    : circles;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-semibold text-foreground tabular-nums">
          {onCount} of {circles.length}{" "}
          {circles.length === 1 ? "circle" : "circles"} follow this roadmap
          {viaCount > 0 && ` · ${viaCount} through a branch`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {published
            ? "Taking a circle off hides the roadmap from it and keeps everything its members recorded."
            : "Members won't see anything until you publish."}
        </p>
      </div>

      <section>
        <SectionHeading>By branch</SectionHeading>
        <p className="mb-2 text-sm text-muted-foreground">
          Every circle in a ticked branch and the branches inside it follows,
          including circles that join later.
        </p>
        {branches.length > 0 ? (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {branches.map((b) => {
              const covered = coveredBy.get(b.id);
              const count = subtreeCounts.get(b.id) ?? 0;
              return (
                <li key={b.id}>
                  <label
                    className="flex min-h-14 cursor-pointer items-center gap-3 py-2 pr-4 transition-colors duration-[var(--duration-fast)] first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-hover"
                    style={{
                      paddingLeft: `calc(1rem + ${Math.min(b.depth, 5)} * 1.25rem)`,
                    }}
                  >
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-primary"
                      checked={b.assigned}
                      disabled={busyBranch !== null}
                      onChange={() => void toggleBranch(b)}
                    />
                    <BranchesIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium wrap-anywhere text-foreground">
                        {b.name}
                      </span>
                      {covered && !b.assigned && (
                        <span className="block text-xs text-muted-foreground">
                          Already covered by {covered}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {count} {count === 1 ? "circle" : "circles"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-outline p-4 text-sm text-muted-foreground">
            No branches yet. Create them in Admin › Branches to assign a roadmap
            to a whole place at once.
          </p>
        )}
      </section>

      <section>
        <SectionHeading>Single circles</SectionHeading>
        <p className="mb-2 text-sm text-muted-foreground">
          For a circle outside any branch, or one exception. A circle&rsquo;s
          admins can also add it from Manage.
        </p>

        {circles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-outline p-5 text-sm text-muted-foreground">
            No circles exist yet. They appear here as soon as someone starts
            one.
          </p>
        ) : (
          <>
            {circles.length > 8 && (
              <Input
                type="search"
                aria-label="Find a circle"
                placeholder="Find a circle"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mb-2"
              />
            )}
            {shown.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No circle matches &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                {shown.map((c) => (
                  <li key={c.id}>
                    <label
                      className={
                        "flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-[var(--duration-fast)] first:rounded-t-2xl last:rounded-b-2xl " +
                        (c.viaBranch
                          ? "cursor-default"
                          : "cursor-pointer hover:bg-surface-hover")
                      }
                    >
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-primary"
                        checked={c.following}
                        disabled={Boolean(c.viaBranch)}
                        onChange={() => void toggle(c)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium wrap-anywhere text-foreground">
                          {c.name}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {c.memberCount}{" "}
                          {c.memberCount === 1 ? "member" : "members"}
                        </span>
                      </span>
                      {c.viaBranch && (
                        <Badge variant="neutral" size="sm">
                          Via {c.viaBranch}
                        </Badge>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
