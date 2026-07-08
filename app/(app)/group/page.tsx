import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveGroup } from "@/lib/active-group";
import { localDateISO, isoDaysAgo } from "@/lib/local-date";
import { q } from "@/lib/db-log";
import type { BreakdownMember } from "@/components/app/member-breakdown";
import type { GridRow } from "@/components/app/task-grid";
import { GroupLive } from "./group-live";
import {
  GroupClient,
  type Contribution,
  type Standing,
  type Steadfast,
  type TaskTotal,
} from "./group-client";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const DAYS = 14;
const STEADFAST_WINDOW = 90;
const STEADFAST_BAR = 85;

/**
 * Group hub, server-first (M5 — reflection surfaces, CET-9/CET-16). One 14-day
 * `logs` range scan (group-wide under RLS) powers every read: the live
 * collective total (Overview), the weekly ranking (Standings), today's
 * contributions + the admin fortnight breakdown (Members). All bounded scans —
 * no rollup needed (the 30-day band / steadfastness / group-90 come with M6's
 * `daily_completion` rollup; the garden / pair goal come with their v2 backends).
 */
export default async function GroupPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub as string;

  const active = await resolveActiveGroup();
  if (!active) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            No group yet
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a circle, or join one with an invite link.
          </p>
          <Link
            href="/groups"
            className={buttonVariants({ variant: "accent", className: "mt-4" })}
          >
            Go to groups
          </Link>
        </div>
      </div>
    );
  }

  const groupId = active.groupId;
  const canManage = active.role === "owner" || active.role === "admin";

  const [
    { data: group },
    { data: profile },
    { data: tasks },
    { data: members },
  ] = await q(
    "group.reads (group+profile+tasks+members)",
    Promise.all([
      supabase.from("groups").select("name").eq("id", groupId).maybeSingle(),
      supabase.from("profiles").select("timezone").eq("id", me).maybeSingle(),
      supabase
        .from("tasks")
        .select("id, label, target_count")
        .eq("group_id", groupId)
        .order("sort_order"),
      supabase
        .from("memberships")
        .select("user_id, role, profiles(name)")
        .eq("group_id", groupId),
    ]),
  );

  const tz = profile?.timezone ?? "UTC";
  const todayISO = localDateISO(tz);
  const taskList = tasks ?? [];
  const taskIds = taskList.map((t) => t.id);
  const memberList = members ?? [];
  const memberIds = memberList.map((m) => m.user_id);

  // One scan: every member's last-fortnight logs (group-readable). Subsets of
  // this feed today's collective, the 7-day ranking, and the 14-day grids.
  const { data: logs } = await q(
    "group.logs (14d, all members)",
    supabase
      .from("logs")
      .select("user_id, task_id, date, count, logged_by")
      .in("task_id", taskIds.length ? taskIds : [ZERO_UUID])
      .gte("date", isoDaysAgo(todayISO, DAYS - 1)),
  );

  // Admin oversight needs peer streaks (RLS: self + members of groups I admin).
  const streakMap = new Map<string, number>();
  if (canManage && memberIds.length) {
    const { data: streaks } = await q(
      "group.streaks (peers, admin)",
      supabase
        .from("streaks")
        .select("user_id, current")
        .in("user_id", memberIds),
    );
    for (const s of streaks ?? []) streakMap.set(s.user_id, s.current);
  }

  // Index: `user|task|date` → { count, loggedBy } (unique per the logs key).
  const index = new Map<string, { count: number; loggedBy: string | null }>();
  for (const l of logs ?? []) {
    index.set(`${l.user_id}|${l.task_id}|${l.date}`, {
      count: l.count,
      loggedBy: l.logged_by,
    });
  }
  const countOf = (u: string, t: string, d: string) =>
    index.get(`${u}|${t}|${d}`)?.count ?? 0;

  const names: Record<string, string> = {};
  for (const m of memberList) names[m.user_id] = m.profiles?.name ?? "Member";

  const dates14 = Array.from({ length: DAYS }, (_, i) =>
    isoDaysAgo(todayISO, DAYS - 1 - i),
  );
  const last7 = new Set(
    Array.from({ length: 7 }, (_, i) => isoDaysAgo(todayISO, i)),
  );

  // Overview — collective per-task total today vs (target × members).
  const taskTotals: TaskTotal[] = taskList.map((t) => ({
    taskId: t.id,
    label: t.label,
    total: memberIds.reduce((s, u) => s + countOf(u, t.id, todayISO), 0),
    goal: t.target_count * memberList.length,
  }));

  // Members — today's total contribution per member (sorted desc).
  const contributions: Contribution[] = memberList
    .map((m) => ({
      userId: m.user_id,
      name: names[m.user_id],
      role: m.role as Contribution["role"],
      isMe: m.user_id === me,
      today: taskList.reduce(
        (s, t) => s + countOf(m.user_id, t.id, todayISO),
        0,
      ),
    }))
    .sort((a, b) => b.today - a.today);

  // Standings — weekly ranking: days-active (any count) then total, over 7 days.
  // (No per-row streak: peer streaks aren't member-readable under RLS — that
  // column is admin-only, surfaced in the breakdown below.)
  const standings: Standing[] = memberList
    .map((m) => {
      let total = 0;
      const activeDates = new Set<string>();
      for (const t of taskList) {
        for (const d of last7) {
          const c = countOf(m.user_id, t.id, d);
          if (c > 0) {
            total += c;
            activeDates.add(d);
          }
        }
      }
      return {
        userId: m.user_id,
        name: names[m.user_id],
        isMe: m.user_id === me,
        daysActive: activeDates.size,
        total,
      };
    })
    .sort((a, b) => b.daysActive - a.daysActive || b.total - a.total);

  // Members breakdown — the admin-only fortnight grid + summary, per member.
  const breakdowns: Record<string, BreakdownMember> = {};
  if (canManage) {
    for (const m of memberList) {
      const rows: GridRow[] = taskList.map((t) => ({
        taskId: t.id,
        label: t.label,
        cells: dates14.map((date) => {
          const cell = index.get(`${m.user_id}|${t.id}|${date}`);
          const count = cell?.count ?? 0;
          const target = t.target_count;
          return {
            date,
            count,
            target,
            pct: target ? Math.min(1, count / target) : 0,
            full: count >= target,
            loggedBy: cell?.loggedBy ?? null,
          };
        }),
      }));
      const daysFull = taskList.length
        ? dates14.filter((d) =>
            taskList.every(
              (t) => countOf(m.user_id, t.id, d) >= t.target_count,
            ),
          ).length
        : 0;
      breakdowns[m.user_id] = {
        id: m.user_id,
        name: names[m.user_id],
        role: m.role as BreakdownMember["role"],
        score: Math.round((daysFull / DAYS) * 100),
        daysFull,
        streak: streakMap.get(m.user_id) ?? 0,
        rows,
      };
    }
  }

  // M6 — the group's 90-day collective consistency (the North Star, PRD §9).
  // An aggregate RPC so a plain member sees the figure without reading peers'
  // individual rollup rows (RLS forbids that; the RPC returns only the number).
  const { data: groupConsistency90 } = await q(
    "group.group_consistency (90d)",
    supabase.rpc("group_consistency", { p_group: groupId, p_days: 90 }),
  );

  // M6 — the admin-only steadfastness board (D31): each member's recent
  // consistency RATE = avg(completion_pct) over their last-90 rollup rows
  // (a rate, not a sum; partial credit); ≥14 active days to qualify; an ≥85%
  // recognition bar (not a single winner). Admin reads members' rows under RLS.
  let steadfastness: Steadfast[] = [];
  if (canManage && memberIds.length) {
    const { data: dc } = await q(
      "group.daily_completion (90d, steadfastness)",
      supabase
        .from("daily_completion")
        .select("user_id, completion_pct")
        .eq("group_id", groupId)
        .gte("date", isoDaysAgo(todayISO, STEADFAST_WINDOW)),
    );
    const agg = new Map<string, { sum: number; n: number; active: number }>();
    for (const r of dc ?? []) {
      const pct = Number(r.completion_pct);
      const a = agg.get(r.user_id) ?? { sum: 0, n: 0, active: 0 };
      a.sum += pct;
      a.n += 1;
      if (pct > 0) a.active += 1;
      agg.set(r.user_id, a);
    }
    steadfastness = memberList
      .map((m) => {
        const a = agg.get(m.user_id);
        const measuredDays = a?.active ?? 0;
        const eligible = measuredDays >= 14;
        const pct = a && a.n ? Math.round(a.sum / a.n) : 0;
        return {
          userId: m.user_id,
          name: names[m.user_id],
          isMe: m.user_id === me,
          pct,
          measuredDays,
          eligible,
          meetsBar: eligible && pct >= STEADFAST_BAR,
        };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.pct - a.pct);
  }

  return (
    <>
      <GroupLive groupId={groupId} taskIds={taskIds} />
      <GroupClient
        groupId={groupId}
        groupName={group?.name ?? "Circle"}
        memberCount={memberList.length}
        canManage={canManage}
        todayISO={todayISO}
        days={DAYS}
        tasks={taskList.map((t) => ({
          id: t.id,
          label: t.label,
          target: t.target_count,
        }))}
        taskTotals={taskTotals}
        contributions={contributions}
        standings={standings}
        breakdowns={breakdowns}
        groupConsistency90={groupConsistency90 ?? 0}
        steadfastness={steadfastness}
        steadfastBar={STEADFAST_BAR}
        names={names}
        viewerId={me}
      />
    </>
  );
}
