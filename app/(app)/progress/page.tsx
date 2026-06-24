"use client";

import * as React from "react";
import { Card, CardContent, Avatar } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { ConsistencyHeatmap } from "@/components/demo/consistency-heatmap";
import { FlameIcon } from "@/components/demo/icons";

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
  const role = state.session.viewRole;
  const showOversight = role === "group_admin" || role === "admin";

  // Heavy-ish derived data — memoise so the realtime ticker doesn't recompute it.
  const { heat, c7, c30, c90, groupC90, members } = React.useMemo(() => {
    return {
      heat: sel.heatmap(state, me.id, group.id, 90),
      c7: sel.consistency(state, me.id, group.id, 7),
      c30: sel.consistency(state, me.id, group.id, 30),
      c90: sel.consistency(state, me.id, group.id, 90),
      groupC90: sel.groupConsistency(state, group.id, 90),
      members: sel.memberConsistency(state, group.id, 30),
    };
  }, [state, me.id, group.id]);

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Consistency
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {group.name} · how steadfast you are over time
        </p>
      </header>

      {/* Personal — heatmap + scores */}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="grid grid-cols-3 gap-3">
            <Score label="30-day" value={`${c30}%`} sub="days completed" />
            <Score
              label="Current"
              value={
                <span className="flex items-center gap-1">
                  <FlameIcon className="size-5 text-accent" />
                  {streak?.current ?? 0}
                </span>
              }
              sub="day streak"
            />
            <Score
              label="Longest"
              value={streak?.longest ?? 0}
              sub="day streak"
            />
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Last 90 days
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                7d {c7}% · 30d {c30}% · 90d {c90}%
              </span>
            </div>
            <ConsistencyHeatmap data={heat} />
          </div>
        </CardContent>
      </Card>

      {/* Group collective rollup — shown to everyone (the North Star, visible) */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div>
            <Score label="Group · 90 days" value={`${groupC90}%`} />
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              The circle&rsquo;s collective consistency. Goal:{" "}
              <span className="font-semibold text-foreground">70%+</span>{" "}
              together over 90 days — showing up, not perfection.
            </p>
          </div>
          <div
            className="grid size-16 shrink-0 place-items-center rounded-full text-lg font-bold text-primary tabular-nums"
            style={{
              background: `conic-gradient(var(--primary) ${groupC90 * 3.6}deg, var(--muted) 0)`,
            }}
            aria-hidden
          >
            <span className="grid size-12 place-items-center rounded-full bg-card">
              {groupC90}%
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Group-admin oversight — every member's consistency (accountability) */}
      {showOversight && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Member consistency · last 30 days
          </h2>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <Avatar name={m.user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {m.user.name.split(" ")[0]}
                        {m.userId === me.id && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {m.score}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${m.score}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
