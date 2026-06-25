"use client";

/**
 * Achievement badges (CET-20) — escalating accomplishment, never saturating.
 *
 * Streak landmarks (7 / 30 / 100 days) and consistency awards, earned not given.
 * They escalate (each harder than the last) so they keep meaning instead of
 * turning into wallpaper, and pair naturally with the fresh-start moment. White-
 * hat: locked badges are shown as calm aspirations, never as a nagging deficit.
 */

import * as React from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";

export function BadgesGrid() {
  const { state } = useMock();
  const me = state.session.currentUserId;
  const group = sel.activeGroup(state);
  const badges = sel.badges(state, me, group.id);
  const earned = badges.filter((b) => b.earned).length;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Achievements</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {earned} of {badges.length} earned
        </span>
      </div>

      <Card className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-6">
        {badges.map((b) => (
          <div
            key={b.id}
            title={b.description}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <div
              className={cn(
                "grid size-14 place-items-center rounded-2xl text-2xl transition-transform",
                b.earned
                  ? "bg-accent-100 shadow-sm hover:-translate-y-0.5"
                  : "bg-muted grayscale",
              )}
            >
              <span aria-hidden className={cn(!b.earned && "opacity-35")}>
                {b.glyph}
              </span>
            </div>
            <span
              className={cn(
                "text-[0.7rem] leading-tight font-medium",
                b.earned ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {b.label}
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}
