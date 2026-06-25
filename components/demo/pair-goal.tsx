"use client";

/**
 * Winnable sub-group / pair goals (CET-22).
 *
 * A single whole-group ranking can dishearten the bottom half. A shared goal
 * between two buddies keeps competition *winnable* and intrinsic (Duolingo's
 * lesson) — you win *together* by both showing up, not by out-scoring a peer.
 * Here: the pair's combined active-days this week vs a modest shared target.
 */

import * as React from "react";
import { Avatar, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";

export function PairGoal() {
  const { state } = useMock();
  const me = sel.currentUser(state);
  const group = sel.activeGroup(state);
  const goal = sel.pairGoal(state, me.id, group.id);
  if (!goal) return null;

  const { buddy, combined, target, met } = goal;
  const pct = Math.min(100, (combined / target) * 100);
  const remaining = Math.max(0, target - combined);

  return (
    <Card
      className={cn("p-4", met ? "border-success-500/40 bg-success-500/5" : "")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            <Avatar name={me.name} size="sm" className="ring-2 ring-card" />
            <Avatar
              name={buddy.user.name}
              size="sm"
              className="ring-2 ring-card"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              You &amp; {buddy.user.name.split(" ")[0]}
            </p>
            <p className="text-xs text-muted-foreground">
              Pair goal · this week
            </p>
          </div>
        </div>
        <span className="font-display text-sm font-bold text-foreground tabular-nums">
          {combined}/{target}
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-brand)]",
            met ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {met ? (
          <span className="font-medium text-success">
            MashaAllah — you won the week together. 🎉
          </span>
        ) : (
          <>
            {remaining} more active {remaining === 1 ? "day" : "days"} between
            you to win the week — cheer each other on.
          </>
        )}
      </p>
    </Card>
  );
}
