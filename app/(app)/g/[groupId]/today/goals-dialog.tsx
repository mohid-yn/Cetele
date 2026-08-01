"use client";

import * as React from "react";
import { Button, Dialog, Input } from "@/components/ui";
import { goalCap } from "@/lib/goals";
import { setTaskGoal } from "./actions";

/**
 * Every goal I aim at in ONE circle, edited together (D51).
 *
 * The per-task control this replaces lived in the count screen's correction
 * tray, two screens deep and styled to recede — and the owner, who asked for
 * the feature and knew it had shipped, could not find it. Raising your bar is
 * an aspiration, not a correction: it belongs where the day starts, next to the
 * rings it governs, and it is a circle-level decision rather than a per-task
 * one (you decide how hard you are going at THIS cetele, then distribute).
 *
 * A modal is the right container here and not a reflex: this is a small set of
 * numbers committed together, it must not lose the member's place on Today, and
 * a half-typed goal should be abandonable. Nothing is written until Save.
 */

export type GoalRow = {
  id: string;
  label: string;
  /** The circle's share — the floor, and the only number anything shared or
   *  scored ever reads (D51). */
  target: number;
  /** What I currently aim at: `target` unless I have raised it. */
  goal: number;
};

export function GoalsDialog({
  open,
  onClose,
  groupId,
  groupName,
  tasks,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  tasks: GoalRow[];
  /** Effective goals as the SERVER returned them, per task (D45). */
  onSaved: (goals: Record<string, number>) => void;
}) {
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Re-seed each time the dialog OPENS, so an abandoned edit is genuinely
  // abandoned rather than waiting behind the next open.
  //
  // Adjusted during render, not in an effect — React's endorsed pattern and the
  // same one `lib/use-prop-state.ts` documents. An effect here is a lint error
  // in this repo, and it would also seed one render LATE, so the first paint of
  // the dialog would show the previous edit before correcting itself.
  //
  // It cannot key on `tasks`: that array is a fresh identity on every parent
  // render, so re-seeding from it would wipe whatever is being typed.
  const [seeded, setSeeded] = React.useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setDraft(Object.fromEntries(tasks.map((t) => [t.id, String(t.goal)])));
    setErrors({});
    setFormError(null);
  } else if (!open && seeded) {
    setSeeded(false);
  }

  const setRow = (id: string, value: string) => {
    setDraft((d) => ({ ...d, [id]: value }));
    // Clear the row's error as soon as it is being corrected — an error that
    // outlives the mistake reads as the control being broken.
    setErrors((e) => (e[id] ? { ...e, [id]: "" } : e));
    setFormError(null);
  };

  async function save() {
    // Validate EVERY row before writing any of them: a partial save that stops
    // at the first bad row leaves the member with some goals moved and some not,
    // and no way to tell which from looking at the dialog.
    const nextErrors: Record<string, string> = {};
    const changes: { task: GoalRow; value: number }[] = [];

    for (const t of tasks) {
      const raw = (draft[t.id] ?? "").trim();
      if (raw === "") {
        nextErrors[t.id] =
          `Enter a number — ${t.target.toLocaleString()} puts you back on the circle's.`;
        continue;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        nextErrors[t.id] = "That isn't a number.";
        continue;
      }
      const value = Math.max(0, Math.round(parsed));
      // Mirrors set_task_goal's cap (itself D36a's count cap) so an impossible
      // goal is refused here, before the dialog closes on it. A goal above the
      // cap could never be reached: every write closing on it would be refused.
      const cap = goalCap(t.target);
      if (value > cap) {
        nextErrors[t.id] = `Up to ${cap.toLocaleString()} on this one.`;
        continue;
      }
      // Anything at or below the circle's share is a CLEAR, not a lower goal —
      // sent as null so the row is deleted rather than storing dead data.
      if (value !== t.goal) changes.push({ task: t, value });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (changes.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    const applied: Record<string, number> = {};
    const failed: string[] = [];
    // Serialized on purpose: these are a handful of writes against one member's
    // own rows, and a failure needs to name the task it belongs to.
    for (const c of changes) {
      const res = await setTaskGoal(
        groupId,
        c.task.id,
        c.value <= c.task.target ? null : c.value,
      );
      if (res.error || res.goal == null) failed.push(c.task.label);
      else applied[c.task.id] = res.goal;
    }
    setSaving(false);

    // Hand back what LANDED, including on a partial failure — the rows that
    // saved are real and the screen must not keep showing the old numbers.
    if (Object.keys(applied).length > 0) onSaved(applied);

    if (failed.length > 0) {
      setDraft((d) => ({
        ...d,
        ...Object.fromEntries(
          Object.entries(applied).map(([id, g]) => [id, String(g)]),
        ),
      }));
      setFormError(
        `Couldn't save ${failed.join(", ")} — try again in a moment.`,
      );
      return;
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title="My goals"
      description={`${groupName} · only you can see these`}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || tasks.length === 0}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This circle has no tasks yet. Once an admin adds one, you can aim
          higher than the share it sets.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Aim higher than your circle&rsquo;s share. Your goal moves your ring
            and your reminder — never your streak, your consistency, or what the
            circle counts.
          </p>

          <ul className="mt-4 divide-y divide-border border-y border-border">
            {tasks.map((t) => {
              const inputId = `goal-${t.id}`;
              const err = errors[t.id];
              // Keyed off the DRAFT, not the saved goal, so the reset link
              // disappears the moment the number comes back down.
              const stretched = Number(draft[t.id] ?? t.goal) > t.target;
              return (
                <li key={t.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor={inputId}
                      className="min-w-0 truncate text-sm font-medium text-foreground"
                    >
                      {t.label}
                    </label>
                    {stretched && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setRow(t.id, String(t.target))}
                        className="shrink-0 text-xs font-medium text-primary underline underline-offset-4 disabled:opacity-50"
                      >
                        Back to the circle&rsquo;s
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      id={inputId}
                      type="number"
                      inputMode="numeric"
                      min={t.target}
                      max={goalCap(t.target)}
                      disabled={saving}
                      aria-invalid={err ? true : undefined}
                      aria-describedby={`${inputId}-hint`}
                      className="w-28 tabular-nums"
                      value={draft[t.id] ?? ""}
                      onChange={(e) => setRow(t.id, e.target.value)}
                    />
                    <p
                      id={`${inputId}-hint`}
                      className="min-w-0 text-xs text-muted-foreground"
                    >
                      The circle asks{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {t.target.toLocaleString()}
                      </span>
                    </p>
                  </div>
                  {err && <p className="mt-1.5 text-xs text-danger">{err}</p>}
                </li>
              );
            })}
          </ul>

          {formError && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {formError}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
