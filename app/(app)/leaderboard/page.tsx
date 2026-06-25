"use client";

import * as React from "react";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { FlameIcon } from "@/components/demo/icons";
import { PairGoal } from "@/components/demo/pair-goal";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const { state } = useMock();
  const group = sel.activeGroup(state);
  const rows = sel.leaderboard(state, group.id);
  const meId = state.session.currentUserId;

  return (
    <div className="rise-in flex flex-col gap-4 px-4 pt-5 pb-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Leaderboard
        </h1>
        <p className="text-sm text-muted-foreground">
          {group.name} · this week · by consistency
        </p>
      </header>

      {/* Winnable pair goal (CET-22) — the intrinsic counterpart to the rank */}
      <PairGoal />

      <p className="text-xs text-muted-foreground">
        The ranking is for fun — the pair goal above is the one you win
        together.
      </p>

      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const isMe = row.userId === meId;
          return (
            <li
              key={row.userId}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3 shadow-sm",
                isMe
                  ? "border-accent-300 bg-accent-50"
                  : "border-border bg-card",
              )}
            >
              <span className="w-7 shrink-0 text-center font-display text-lg font-bold text-muted-foreground tabular-nums">
                {i < 3 ? MEDALS[i] : i + 1}
              </span>
              <Avatar name={row.user.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                  {row.user.name}
                  {isMe && (
                    <Badge variant="accent" size="sm">
                      you
                    </Badge>
                  )}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <FlameIcon className="size-3.5 text-accent" />
                    {row.streak}d
                  </span>
                  <span>· {row.daysActive}/7 days active</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-base font-bold text-foreground tabular-nums">
                  {row.total.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">counts</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
