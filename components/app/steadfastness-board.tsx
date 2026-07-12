import { Card, CardContent, Badge } from "@/components/ui";
import { SectionHeading } from "@/components/demo/section-heading";
import { MemberRow } from "@/components/demo/member-row";
import type { Steadfast } from "@/app/(app)/g/[groupId]/group/group-client";

/**
 * D31 — admin/owner-only **steadfastness** recognition board (M6, real). Ranks
 * members by a RATE — average daily completion % over a rolling 90-day window
 * (partial credit), never cumulative volume or tenure — so it can't reward
 * rich-get-richer and a consistent newcomer can lead a long-tenured member.
 * Private to managers (never a member-facing board → no riya'). An eligibility
 * *bar* marks who a group *could* recognise, not a single "winner"; any reward
 * happens outside the app. Data is the DB rollup (daily_completion), computed
 * server-side under RLS and passed in.
 */
export function SteadfastnessBoard({
  board,
  bar,
}: {
  board: Steadfast[];
  bar: number;
}) {
  if (board.length === 0) return null;
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
              name={m.name.split(" ")[0]}
              you={m.isMe}
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
              ≥ {bar}% = could be recognised
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
