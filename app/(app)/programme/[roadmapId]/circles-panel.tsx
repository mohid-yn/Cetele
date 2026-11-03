"use client";

import * as React from "react";
import { Input } from "@/components/ui";
import { usePropState } from "@/lib/use-prop-state";
import { setCircleOnRoadmap } from "./authoring-actions";

export type RoadmapCircle = {
  id: string;
  name: string;
  memberCount: number;
  following: boolean;
};

/**
 * Which circles are on this roadmap (D72). Rows stay in alphabetical order when
 * toggled, so the row under a thumb never moves. A search box appears only once
 * the list is too long to scan.
 */
export function CirclesPanel({
  roadmapId,
  published,
  circles: serverCircles,
}: {
  roadmapId: string;
  published: boolean;
  circles: RoadmapCircle[];
}) {
  const [circles, setCircles] = usePropState(serverCircles);
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

  const onCount = circles.filter((c) => c.following).length;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? circles.filter((c) => c.name.toLowerCase().includes(needle))
    : circles;

  if (circles.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-outline p-5 text-sm text-muted-foreground">
        No circles exist yet. They appear here as soon as someone starts one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-semibold text-foreground tabular-nums">
          {onCount} of {circles.length}{" "}
          {circles.length === 1 ? "circle" : "circles"} on this roadmap
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {published
            ? "Taking a circle off hides the roadmap from it and keeps everything its members recorded."
            : "Members won't see anything until you publish."}{" "}
          A circle&rsquo;s admins can also change this from Manage.
        </p>
      </div>

      {circles.length > 8 && (
        <Input
          type="search"
          aria-label="Find a circle"
          placeholder="Find a circle"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-[var(--duration-fast)] first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-hover">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  checked={c.following}
                  onChange={() => void toggle(c)}
                />
                <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere text-foreground">
                  {c.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
