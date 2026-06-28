"use client";

import * as React from "react";
import { Card, CardContent, Badge } from "@/components/ui";
import { useMock, sel } from "@/lib/mock/store";
import { SectionHeading } from "@/components/demo/section-heading";
import { MemberRow } from "@/components/demo/member-row";

const WINDOW = 90;
const BAR = 85;

/**
 * D31 — admin/owner-only **steadfastness** recognition board. Ranks members by a
 * RATE (average daily completion % over a sliding 90-day window, partial
 * credit), never cumulative volume or tenure — so it can't reward rich-get-
 * richer and a newcomer who's consistent can lead a long-tenured one. **Private
 * to managers**: never shown to members (no public board → no riya'). An
 * eligibility *bar* marks who a group *could* recognise, not a single "winner";
 * any actual reward happens outside the app (D31).
 */
export function SteadfastnessBoard({ groupId }: { groupId: string }) {
  const { state } = useMock();
  const me = sel.currentUser(state);
  // Heavy-ish (members × 90 days) — memoise so the realtime ticker doesn't churn.
  const board = React.useMemo(
    () => sel.steadfastnessBoard(state, groupId, WINDOW, BAR),
    [state, groupId],
  );
  const eligibleCount = board.filter((m) => m.meetsBar).length;

  return (
    <section>
      <SectionHeading>Steadfastness · last 90 days</SectionHeading>
      <p className="mb-3 text-xs text-muted-foreground">
        Recent consistency as a rate — average daily completion over a rolling
        90 days, so it rewards showing up lately, not seniority or volume. Only
        you (owner&nbsp;/&nbsp;admin) can see this.
      </p>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          {board.map((m, i) => (
            <MemberRow
              key={m.userId}
              name={m.user.name.split(" ")[0]}
              you={m.userId === me.id}
              leading={
                <span className="w-5 text-center text-sm font-semibold text-muted-foreground tabular-nums">
                  {m.eligible ? i + 1 : "–"}
                </span>
              }
              status={
                m.eligible ? (
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${m.pct}%` }}
                    />
                  </div>
                ) : (
                  <span>
                    Not enough data yet · {m.measuredDays}/14 days logged
                  </span>
                )
              }
              trailing={
                m.eligible ? (
                  <div className="flex items-center gap-2">
                    {m.meetsBar && (
                      <Badge variant="success" size="sm">
                        eligible
                      </Badge>
                    )}
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {m.pct}%
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )
              }
            />
          ))}
          <p className="mt-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              ≥ {BAR}% = could be recognised
            </span>{" "}
            ({eligibleCount} {eligibleCount === 1 ? "member" : "members"}) — a
            bar, not a single winner; needs ≥ 14 logged days to qualify. Any
            reward is the group&rsquo;s own, handled outside the app.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
