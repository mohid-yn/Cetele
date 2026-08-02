/**
 * Who a task belongs to (0023) — the client's mirror of `private.assigned_on`.
 *
 * An admin may scope a task to specific members instead of the whole circle
 * (D54). The database is the authority: `private.obligations` bounds every
 * judged figure — day-completion, streaks, the rollup, consistency,
 * steadfastness (D31), the garden (D49) — by the same rule written here. This
 * module exists so the screens agree with it, not so they can decide for
 * themselves.
 *
 * ASSIGNMENT IS AN INTERVAL, NOT A SET
 *
 * A row is one interval: `assignedAt` until `unassignedAt` (null = still open).
 * Unassigning closes an interval and re-assigning opens a new one, so a past day
 * is judged by who the task belonged to ON THAT DAY. That matters here and not
 * only in SQL, because Today's day-strip renders the last fortnight: a task that
 * became yours this morning must not appear on last Tuesday's rings, and one you
 * were taken off this morning must still appear on the days you carried it.
 *
 * `userId === null` on a row means EVERY member of the circle, resolved when
 * read — that is what lets someone who joins next week pick up the circle's
 * shared tasks without anyone re-assigning anything.
 */

import { timestampDateISO } from "@/lib/local-date";

/** One assignment interval, as the screens read it out of `task_assignments`. */
export type Assignment = {
  taskId: string;
  /** `null` = every member of the circle. */
  userId: string | null;
  /** Raw `timestamptz` — reduced to a date per MEMBER, never stored reduced. */
  assignedAt: string;
  /** Raw `timestamptz`, or `null` while the interval is still open. */
  unassignedAt: string | null;
};

/** A `task_assignments` row as PostgREST returns it. */
export type AssignmentRow = {
  task_id: string;
  user_id: string | null;
  assigned_at: string;
  unassigned_at: string | null;
};

/**
 * DB rows → the shape the predicates below read. Timestamps stay RAW.
 *
 * They used to be reduced to dates here, in UTC, on the argument that
 * `private.assigned_on` did the same (`assigned_at::date`, in the database's
 * own zone) and that a mirror must not be more correct than its original. The
 * first half was true and the second was the wrong conclusion: both were wrong
 * together. `p_day` is the member's LOCAL date (D34), so comparing it against a
 * UTC-reduced timestamp puts the boundary a whole day out for a large slice of
 * every day — measured, an assignment made at 08:00 in Sydney was assigned
 * "yesterday", and one closed at 08:00 stopped applying a day before the member
 * was told. Both functions now reduce on the MEMBER's calendar
 * (`private.user_date`), so the mirror still matches — it just matches
 * something correct.
 *
 * Kept raw rather than reduced once, because the same rows are scored for
 * DIFFERENT members: the group breakdown and Today's roster resolve each member
 * on their own clock, and a single pre-reduced date cannot serve two zones.
 */
export function toAssignments(rows: AssignmentRow[] | null): Assignment[] {
  return (rows ?? []).map((r) => ({
    taskId: r.task_id,
    userId: r.user_id,
    assignedAt: r.assigned_at,
    unassignedAt: r.unassigned_at,
  }));
}

/**
 * Was this task this member's on this day?
 *
 * Mirrors `private.assigned_on` exactly, including both bounds:
 *   * `assignedOn <= day` — an assignment made today counts today, the same way
 *     a task created today is due today (`isDueOn`).
 *   * `day < unassignedOn` — the day you are taken off a task is already not
 *     yours. Being unassigned at 3pm must not leave you owing it until midnight.
 */
export function assignedOn(
  rows: Assignment[],
  taskId: string,
  userId: string,
  dayISO: string,
  timeZone: string,
): boolean {
  return rows.some(
    (a) =>
      a.taskId === taskId &&
      (a.userId === null || a.userId === userId) &&
      timestampDateISO(timeZone, a.assignedAt) <= dayISO &&
      (a.unassignedAt === null ||
        dayISO < timestampDateISO(timeZone, a.unassignedAt)),
  );
}

/**
 * Should this task be OFFERED to this member on this day?
 *
 * Deliberately more permissive than `assignedOn`, and the split is the same one
 * the task-age bound already makes: a day BEFORE a task existed is still offered
 * on the day-strip, because the strip exists to repair the past (D8/D48) and the
 * engine credits a completed log there. Display is permissive; judging is
 * strict. `private.obligations` remains the only authority on what counts.
 *
 * So a task currently mine shows its whole fortnight — otherwise a task assigned
 * to me this morning could never be back-filled, and the member would see the
 * day-strip simply refuse to offer it with nothing on screen explaining why.
 * A task that was mine and is not any more keeps the days I carried it, and
 * loses the ones after. A task that was never mine never appears.
 */
export function visibleOn(
  rows: Assignment[],
  taskId: string,
  userId: string,
  dayISO: string,
  todayISO: string,
  timeZone: string,
): boolean {
  return (
    assignedOn(rows, taskId, userId, dayISO, timeZone) ||
    assignedOn(rows, taskId, userId, todayISO, timeZone)
  );
}

/** The intervals open right now for a task — what the admin is editing. No day
 *  math and so no timezone: "still open" is `unassigned_at is null`, which is
 *  true or false on every calendar at once. */
function openFor(rows: Assignment[], taskId: string): Assignment[] {
  return rows.filter((a) => a.taskId === taskId && a.unassignedAt === null);
}

/** Is this task the whole circle's? */
export function isEveryone(rows: Assignment[], taskId: string): boolean {
  return openFor(rows, taskId).some((a) => a.userId === null);
}

/**
 * Who carries this task right now.
 *
 * `null` means everyone — deliberately not the expanded member list, because
 * "everyone" and "these five people who happen to be everyone" are different
 * settings: the first picks up tomorrow's joiner, the second does not. Callers
 * that need names resolve the null themselves against the member list.
 */
export function currentAssignees(
  rows: Assignment[],
  taskId: string,
): string[] | null {
  if (isEveryone(rows, taskId)) return null;
  return openFor(rows, taskId)
    .map((a) => a.userId)
    .filter((id): id is string => id !== null);
}

/**
 * "Everyone" / "Ahmet" / "2 members" — the one place this phrasing is written.
 * Named rather than counted at one assignee, because "1 member" is a worse
 * answer to "who is this for?" than the person's actual name.
 */
export function assigneeLabel(
  assignees: string[] | null,
  nameOf: (userId: string) => string | undefined,
): string {
  if (assignees === null) return "Everyone";
  if (assignees.length === 0) return "Nobody";
  if (assignees.length === 1) return nameOf(assignees[0]) ?? "1 member";
  return `${assignees.length} members`;
}

/**
 * The circle's collective goal for a task: its target times the number of
 * people who actually carry it.
 *
 * Scoping the denominator is not cosmetic — a task two of eight members carry
 * could never be closed against a goal of `target × 8`, so the circle would
 * show a bar it is structurally unable to fill.
 */
export function collectiveGoal(
  target: number,
  assignees: string[] | null,
  memberCount: number,
): number {
  return target * (assignees === null ? memberCount : assignees.length);
}
