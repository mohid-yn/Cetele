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

/** One assignment interval, as the screens read it out of `task_assignments`. */
export type Assignment = {
  taskId: string;
  /** `null` = every member of the circle. */
  userId: string | null;
  /** ISO date (`YYYY-MM-DD`) the interval opened. */
  assignedOn: string;
  /** ISO date the interval closed, or `null` while it is still open. */
  unassignedOn: string | null;
};

/** A `task_assignments` row as PostgREST returns it. */
export type AssignmentRow = {
  task_id: string;
  user_id: string | null;
  assigned_at: string;
  unassigned_at: string | null;
};

/**
 * DB rows → the shape the screens compare against.
 *
 * The timestamps are reduced to dates in **UTC**, because that is exactly what
 * `private.assigned_on` does (`assigned_at::date`, evaluated in the database's
 * own zone). Converting to the member's local date here would be more
 * "correct" in isolation and would be WRONG in the way that matters: the screen
 * would disagree with the predicate the streak, the rollup and the garden are
 * computed from, so a task could appear on Today that nothing else counted.
 * When a mirror and its original disagree, the mirror is the bug.
 */
export function toAssignments(rows: AssignmentRow[] | null): Assignment[] {
  // Through `Date` rather than slicing the string: PostgREST renders a
  // timestamptz with an offset, and slicing would silently take the date in
  // whatever zone that offset happens to be.
  const utcDate = (ts: string) => new Date(ts).toISOString().slice(0, 10);
  return (rows ?? []).map((r) => ({
    taskId: r.task_id,
    userId: r.user_id,
    assignedOn: utcDate(r.assigned_at),
    unassignedOn: r.unassigned_at ? utcDate(r.unassigned_at) : null,
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
): boolean {
  return rows.some(
    (a) =>
      a.taskId === taskId &&
      (a.userId === null || a.userId === userId) &&
      a.assignedOn <= dayISO &&
      (a.unassignedOn === null || dayISO < a.unassignedOn),
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
): boolean {
  return (
    assignedOn(rows, taskId, userId, dayISO) ||
    assignedOn(rows, taskId, userId, todayISO)
  );
}

/** The intervals open right now for a task — what the admin is editing. */
function openFor(rows: Assignment[], taskId: string): Assignment[] {
  return rows.filter((a) => a.taskId === taskId && a.unassignedOn === null);
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
