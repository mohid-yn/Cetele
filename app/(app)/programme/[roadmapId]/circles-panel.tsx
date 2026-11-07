"use client";

import * as React from "react";
import { Badge, Input } from "@/components/ui";
import { SectionHeading } from "@/components/app/section-heading";
import Link from "next/link";
import { BranchesIcon, ChevronRightIcon } from "@/components/app/icons";
import { usePropState } from "@/lib/use-prop-state";
import { subtreeCircleCounts, type ReachBranch } from "@/lib/reach";
import { setCircleOnRoadmap } from "./authoring-actions";

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
 * Who follows this roadmap (D72, D81, D85), in the two ways it can happen:
 *
 *   1. BRANCHES, shown here and placed from the branch's own page (owner's
 *      choice A, 2026-11-07): a roadmap goes into a branch the way a camp does,
 *      by being in the place. This list only says where it is and links there.
 *   2. SINGLE CIRCLES, the exceptions, still switched here.
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
  const branches = serverBranches;
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

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

  const subtreeCounts = React.useMemo(
    () => subtreeCircleCounts(branches),
    [branches],
  );
  const assigned = branches.filter((b) => b.assigned);

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
        <SectionHeading>Branches</SectionHeading>
        {assigned.length > 0 ? (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {assigned.map((b) => {
              const count = subtreeCounts.get(b.id) ?? 0;
              return (
                <li key={b.id}>
                  <Link
                    href={`/admin/branches/${b.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-[var(--duration-fast)] first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-hover"
                  >
                    <BranchesIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere text-foreground">
                      Followed in {b.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {count} {count === 1 ? "circle" : "circles"}
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No branch follows it yet.
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          To add a whole branch, open it in{" "}
          <Link
            href="/admin/branches"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Branches
          </Link>{" "}
          and add the roadmap there. Every circle inside follows, including
          circles that join later.
        </p>
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
