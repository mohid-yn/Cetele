"use client";

/**
 * One member's share of each task, edited by an admin (D61).
 *
 * A cetele is a shared goal SPLIT between people, and the split is not always
 * equal — somebody who can carry 500 takes 500. This is where an admin says so.
 *
 * WHICH OF THE THREE NUMBERS THIS IS
 *
 *   the circle's target — `tasks.target_count`. What the circle asks of everyone
 *                         by default, edited in Manage, not here.
 *   this member's SHARE — what it asks of THEM. Obligation: it is what "done"
 *                         means for them, what their streak is judged at, and
 *                         what the circle counts on them for. This control.
 *   their own stretch   — `member_task_goals`, private, theirs alone, judged by
 *                         nothing. An admin cannot see or set it, on purpose.
 *
 * Raise-only against the circle's target, and refused OUT LOUD rather than
 * quietly rounded up: `greatest(share, circle target)` would ignore a smaller
 * number anyway, and a rule the app enforces silently is a rule nobody learns
 * (the lesson `goals-dialog.tsx` records for the member's own axis).
 *
 * Nothing is written until Save, and each row saves on its own — this is a set
 * of independent decisions about one person, not a form.
 */

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { goalCap } from "@/lib/goals";
import { effectiveTarget } from "@/lib/shares";
import { setMemberShare } from "@/app/(app)/g/[groupId]/group/actions";

export type MemberShare = {
  taskId: string;
  label: string;
  /** `tasks.target_count` — what the circle asks of everyone by default. */
  circleTarget: number;
  /** Their own share, or `null` when they are on the circle's number. */
  share: number | null;
};

/**
 * What the circle actually asks of this member for this task.
 *
 * `effectiveTarget` rather than a `Math.max` written out here: it is the client
 * mirror of `private.effective_target` (D61), it is pinned against the SQL
 * case-for-case by pgTAP 018, and a second copy of `greatest(share, target)` in
 * this file is precisely the mirror-drift this repo keeps paying for. Two
 * expressions of it disagreeing is what put the stale number in the draft below.
 */
const asked = (s: MemberShare) => effectiveTarget(s.share, s.circleTarget);

export function MemberShares({
  groupId,
  userId,
  memberName,
  shares,
}: {
  groupId: string;
  userId: string;
  memberName: string;
  shares: MemberShare[];
}) {
  // Seeded once per member — the dialog is keyed on the member id, so a fresh
  // mount per person is what re-seeds this.
  //
  // Seeded from `asked`, NOT from `share` — and they are different numbers the
  // moment a circle-wide raise overtakes a standing share. `greatest(share,
  // circle target)` is what the member actually owes (D61), so a share of 50
  // under a circle since raised to 100 must open showing 100. Seeding from the
  // stale 50 opened the row dirty, on a number the RPC's floor check then
  // refused out loud — a control that greets an admin with an error they did
  // not cause. The two expressions disagreeing is what caused it, so there is
  // now only one.
  const [draft, setDraft] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(shares.map((s) => [s.taskId, String(asked(s))])),
  );
  const [saved, setSaved] = React.useState<Record<string, number>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  /** What they are asked for right now, allowing for a save this session. */
  const current = (s: MemberShare) => saved[s.taskId] ?? asked(s);

  async function commit(s: MemberShare) {
    const raw = (draft[s.taskId] ?? "").trim();
    if (raw === "") {
      setErrors((e) => ({
        ...e,
        [s.taskId]: `Enter a number — ${s.circleTarget.toLocaleString()} puts them back on the circle's.`,
      }));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setErrors((e) => ({ ...e, [s.taskId]: "That isn't a number." }));
      return;
    }
    const value = Math.max(0, Math.round(parsed));

    // Mirrors the RPC's cap (itself D36a's count cap) so an impossible share is
    // refused here, before the row reports success. A share above it would be
    // one no legal write could ever close — every count meeting it refused.
    const cap = goalCap(s.circleTarget);
    if (value > cap) {
      setErrors((e) => ({
        ...e,
        [s.taskId]: `Up to ${cap.toLocaleString()} on this one.`,
      }));
      return;
    }
    // BELOW the circle's target is refused rather than silently clamped. It is
    // also not the same act as clearing, which is why "Back to the circle's"
    // exists as its own control: typing the circle's own number means "they
    // carry the default", and typing less means the admin wants something the
    // app does not do yet (lowering a member below the circle is deliberately
    // not built — it changes what everyone else is judged against).
    if (value < s.circleTarget) {
      setErrors((e) => ({
        ...e,
        [s.taskId]: `The circle asks ${s.circleTarget.toLocaleString()} — a share can only be higher, never lower.`,
      }));
      return;
    }

    setErrors((e) => ({ ...e, [s.taskId]: "" }));
    setSaving(s.taskId);
    // At or below the circle's target is a CLEAR, sent as null so the interval
    // is closed rather than storing a row `greatest()` would ignore.
    const res = await setMemberShare(
      groupId,
      s.taskId,
      userId,
      value <= s.circleTarget ? null : value,
    );
    setSaving(null);
    // `res` is typed non-null but the action redirects on a stale session,
    // which resolves the call to nothing.
    if (!res || res.error || res.target == null) {
      setErrors((e) => ({
        ...e,
        [s.taskId]: res?.error ?? "Couldn't save — try again in a moment.",
      }));
      return;
    }
    setSaved((v) => ({ ...v, [s.taskId]: res.target as number }));
    setDraft((d) => ({ ...d, [s.taskId]: String(res.target) }));
  }

  if (shares.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {memberName} carries no tasks in this circle yet.
      </p>
    );
  }

  return (
    <div>
      {/* ONE expression, not text-around-an-expression. JSX drops the space
          where a text run is broken across a line, so the name and the word
          after it rendered as "of Yusufthan the circle's default" — and an
          explicit `{" "}` does not survive, because Prettier reflows the line
          straight back into the broken shape. The group hub's collective
          caption carries the same fix for the same reason ("100toward"). */}
      <p className="text-sm text-muted-foreground">
        The circle&rsquo;s goal is split between its members. You can ask{" "}
        <span className="font-medium text-foreground">more</span>
        {` of ${memberName} than the circle’s default — never less. This is what their day, their streak and the circle’s total are measured against.`}
      </p>

      <ul className="mt-3 divide-y divide-border border-y border-border">
        {shares.map((s) => {
          const inputId = `share-${s.taskId}`;
          const err = errors[s.taskId];
          // Keyed off the DRAFT so the reset link disappears the moment the
          // number comes back down, not only after a save.
          const raised = Number(draft[s.taskId] ?? 0) > s.circleTarget;
          const dirty = (draft[s.taskId] ?? "") !== String(current(s));
          return (
            <li key={s.taskId} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <label
                  htmlFor={inputId}
                  className="min-w-0 truncate text-sm font-medium text-foreground"
                >
                  {s.label}
                </label>
                {raised && (
                  <Button
                    variant="link"
                    size="inline"
                    disabled={saving === s.taskId}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        [s.taskId]: String(s.circleTarget),
                      }))
                    }
                    className="shrink-0 text-xs font-medium underline"
                  >
                    Back to the circle&rsquo;s
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={s.circleTarget}
                  max={goalCap(s.circleTarget)}
                  disabled={saving === s.taskId}
                  aria-invalid={err ? true : undefined}
                  // The error first, then the default. Without the error id here
                  // a screen reader announces "the circle asks 100" and nothing
                  // about why the save was refused.
                  aria-describedby={
                    err ? `${inputId}-err ${inputId}-hint` : `${inputId}-hint`
                  }
                  className="h-9 w-24 tabular-nums"
                  value={draft[s.taskId] ?? ""}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [s.taskId]: e.target.value }));
                    // Clear the row's error as soon as it is being corrected —
                    // an error outliving the mistake reads as a broken control.
                    setErrors((x) =>
                      x[s.taskId] ? { ...x, [s.taskId]: "" } : x,
                    );
                  }}
                />
                <p
                  id={`${inputId}-hint`}
                  className="min-w-0 text-xs text-muted-foreground"
                >
                  the circle asks{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {s.circleTarget.toLocaleString()}
                  </span>
                </p>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!dirty || saving === s.taskId}
                  onClick={() => void commit(s)}
                >
                  {saving === s.taskId ? "Saving…" : "Save"}
                </Button>
              </div>
              {err && (
                <p id={`${inputId}-err`} className="mt-1.5 text-xs text-danger">
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
