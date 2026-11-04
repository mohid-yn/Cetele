"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Field, Input } from "@/components/ui";
import { goalCap, frequencyLabel, MAX_FREQUENCY_DAYS } from "@/lib/goals";
import { FrequencyPicker } from "@/components/app/frequency-picker";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  LinkIcon,
  PlusIcon,
} from "@/components/app/icons";
import { cn } from "@/lib/utils";
import { langOf } from "@/lib/text-direction";
import {
  MAX_CLUSTER_SIZE,
  clusterSize,
  liveCircleCount,
  rankCandidates,
  type LinkableTask,
  type LinkedSibling,
} from "@/lib/task-links";
import {
  setTaskGoal,
  setTaskFrequency,
  linkTasks,
  unlinkTask,
  addPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
} from "./actions";

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
  /** The circle's cycle in days (0021). */
  frequencyDays: number;
  /** My own denser cycle, if I set one. */
  myFrequencyDays: number | null;
  /** Tasks in OTHER circles I have called the same act (D64). */
  links: LinkedSibling[];
  /** The one cross-circle task worth offering to link this to, or null. */
  linkSuggestion: LinkableTask | null;
  /** I added this one for myself (D70) — mine to change and mine to remove,
   *  and the circle's collective bar does not count it. */
  personal: boolean;
  /** The task's own note. Only ever edited on a personal task, where the
   *  member wrote it; on a circle task it is the admin's and read-only here. */
  subtitle: string | null;
};

export function GoalsDialog({
  open,
  onClose,
  groupId,
  groupName,
  tasks,
  linkCandidates,
  onSaved,
  onFrequencySaved,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  tasks: GoalRow[];
  /**
   * Every task this member carries in their OTHER circles — the full menu the
   * link pane offers, not just what the matcher guessed.
   *
   * One list serves every row, because every task in this dialog is in THIS
   * circle and every candidate is in another one, so the cross-circle rule can
   * never disqualify a pair here.
   */
  linkCandidates: LinkableTask[];
  /** Effective goals as the SERVER returned them, per task (D45). */
  onSaved: (goals: Record<string, number>) => void;
  /** Effective frequencies as the SERVER returned them, per task (D45). */
  onFrequencySaved: (freqs: Record<string, number>) => void;
}) {
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [freqDraft, setFreqDraft] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [linkFor, setLinkFor] = React.useState<string | null>(null);
  const router = useRouter();

  /**
   * THE THIRD PANE (D70) — a task of the member's own, being added or changed.
   *
   * `null` = not in it. `{ taskId: null }` = adding. `{ taskId }` = changing
   * that one. A pane rather than another dialog, for D67's reason exactly:
   * nested modals on a phone are two backdrops, two dismiss gestures and no way
   * back to the first except through the second.
   *
   * It is a form and not a row of inline inputs because adding a task is a set
   * of four decisions committed together, and half of one sitting in the goals
   * list would be indistinguishable from a goal being edited.
   */
  const [own, setOwn] = React.useState<{ taskId: string | null } | null>(null);
  const [ownDraft, setOwnDraft] = React.useState<OwnDraft>(EMPTY_OWN);
  const [ownError, setOwnError] = React.useState<string | null>(null);
  const [ownSaving, setOwnSaving] = React.useState(false);
  /** Two-tap remove. A confirm DIALOG inside a dialog is the nesting this pane
   *  exists to avoid, so the button asks for itself twice instead. */
  const [confirmRemove, setConfirmRemove] = React.useState(false);

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
    setFreqDraft(
      Object.fromEntries(
        tasks.map((t) => [t.id, String(t.myFrequencyDays ?? t.frequencyDays)]),
      ),
    );
    setErrors({});
    setFormError(null);
    // Back to the goals list. Reset on OPEN rather than on close: the card
    // animates OUT over `DURATION.base`, so clearing it on close would flip the
    // pane back under the member while they watch it go.
    setLinkFor(null);
    setOwn(null);
    setOwnError(null);
    setConfirmRemove(false);
  } else if (!open && seeded) {
    setSeeded(false);
  }

  /**
   * The task whose links are being managed — the dialog's second pane (D66's
   * offer, grown into a screen).
   *
   * A modal that opens another modal is the wrong shape on a phone: two
   * backdrops, two dismiss gestures and no way back to the first except through
   * the second. Held as an ID and resolved from `tasks` on every render, so the
   * pane picks up a fresh `links` array after `router.refresh()` rather than
   * rendering a snapshot taken when it opened.
   */
  const linkTask = linkFor
    ? (tasks.find((t) => t.id === linkFor) ?? null)
    : null;

  /** The task being CHANGED, if the own-pane is open on one. Resolved from
   *  `tasks` every render, like `linkTask`, so it picks up a refreshed row. */
  const ownTask = own?.taskId
    ? (tasks.find((t) => t.id === own.taskId) ?? null)
    : null;

  /** Open the own-pane — on an existing task of mine, or empty to add one. */
  const openOwn = (task: GoalRow | null) => {
    setOwn({ taskId: task?.id ?? null });
    setOwnDraft(
      task
        ? {
            label: task.label,
            subtitle: task.subtitle ?? "",
            // A personal task has no circle share to sit above, so this IS the
            // task's own target — the number being edited, not a goal over it.
            target: String(task.target),
            frequency: String(task.frequencyDays),
          }
        : EMPTY_OWN,
    );
    setOwnError(null);
    setConfirmRemove(false);
  };

  /**
   * Add or change it. Writes IMMEDIATELY and on its own, unlike the goals
   * behind it: those are a set of numbers committed together on Save, and this
   * is one whole task — batching it would make "Cancel" ambiguous about whether
   * a task now exists.
   *
   * The bounds mirror `add_personal_task`'s so the member reads a sentence
   * rather than a constraint violation; the RPC refuses regardless, which is
   * what actually holds.
   */
  async function saveOwn() {
    const label = ownDraft.label.trim();
    if (!label) {
      setOwnError("Give it a name.");
      return;
    }
    const target = Math.round(Number(ownDraft.target));
    if (!Number.isFinite(target) || target < 1) {
      setOwnError("How many? At least 1.");
      return;
    }
    const frequency = Number(ownDraft.frequency);
    if (
      !Number.isFinite(frequency) ||
      frequency < 1 ||
      frequency > MAX_FREQUENCY_DAYS
    ) {
      setOwnError(
        `How often must be between 1 and ${MAX_FREQUENCY_DAYS} days.`,
      );
      return;
    }

    setOwnError(null);
    setOwnSaving(true);
    try {
      const input = {
        label,
        subtitle: ownDraft.subtitle,
        target,
        frequency,
      };
      const res = own?.taskId
        ? await updatePersonalTask(groupId, own.taskId, input)
        : await addPersonalTask(groupId, input);
      // `res` is typed non-null but the action redirects on a stale session,
      // which resolves the call to nothing — this dialog's standing guard.
      if (!res || res.error) {
        setOwnError(res?.error ?? "Couldn't save that. Try again in a moment.");
        return;
      }
      // `revalidatePath` alone does not reach a client that stays mounted
      // (`lib/use-action.ts`, and the LinkPane below records the measurement).
      // This dialog does not unmount, so without it the new task would not
      // appear in the list it just returned to.
      router.refresh();
      setOwn(null);
    } catch {
      setOwnError("Couldn't save that. Try again in a moment.");
    } finally {
      setOwnSaving(false);
    }
  }

  /** Remove it. Second tap only — the first arms the button. */
  async function removeOwn() {
    if (!own?.taskId) return;
    setOwnError(null);
    setOwnSaving(true);
    try {
      const res = await deletePersonalTask(groupId, own.taskId);
      if (!res || res.error) {
        setOwnError(
          res?.error ?? "Couldn't remove that. Try again in a moment.",
        );
        return;
      }
      router.refresh();
      setOwn(null);
    } catch {
      setOwnError("Couldn't remove that. Try again in a moment.");
    } finally {
      setOwnSaving(false);
      setConfirmRemove(false);
    }
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
          `Enter a number. ${t.target.toLocaleString()} puts you back on the circle's.`;
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
      // BELOW the circle's share is refused OUT LOUD, not quietly rounded up.
      // `effectiveGoal` is max(target, override), so a lower number was always
      // going to resolve back to the target — but the member typed it, pressed
      // Save and watched the dialog close on their number as if it had taken.
      // A rule the app enforces silently is a rule the member never learns; the
      // frequency picker beside this one has always said "you can only go more
      // often", and the count axis simply never did. (D51)
      if (value < t.target) {
        nextErrors[t.id] =
          `The circle asks ${t.target.toLocaleString()}. You can only aim higher, never lower.`;
        continue;
      }
      // Exactly the circle's share is a CLEAR, not a lower goal — sent as null
      // so the row is deleted rather than storing dead data. That is what the
      // "Back to the circle's" link types in, so it must stay legal.
      if (value !== t.goal) changes.push({ task: t, value });
    }

    // Frequency is a SELECT over a closed 1..14 range, so it cannot be
    // malformed — no validation, only a diff.
    const freqChanges: { task: GoalRow; days: number }[] = [];
    for (const t of tasks) {
      const days = Number(freqDraft[t.id] ?? t.frequencyDays);
      if (
        Number.isFinite(days) &&
        days !== (t.myFrequencyDays ?? t.frequencyDays)
      )
        freqChanges.push({ task: t, days });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (changes.length === 0 && freqChanges.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    const applied: Record<string, number> = {};
    const appliedFreq: Record<string, number> = {};
    const failed: string[] = [];
    // try/finally, not a bare await: `saving` disables every control in here,
    // so if a write throws — the action redirects on a stale session and
    // resolves to nothing, and `res.error` on undefined is a TypeError — the
    // dialog would sit on "Saving…" forever with no way out. A modal you
    // cannot leave is the worst failure this component has.
    try {
      // Serialized on purpose: these are a handful of writes against one
      // member's own rows, and a failure needs to name the task it belongs to.
      for (const c of changes) {
        const res = await setTaskGoal(
          groupId,
          c.task.id,
          c.value <= c.task.target ? null : c.value,
        );
        // `res` is typed non-null but the action redirects on a stale session
        // (lib/stale-session.ts), which resolves the call to nothing — the
        // same guard the count screen has always carried.
        if (!res || res.error || res.goal == null) failed.push(c.task.label);
        else applied[c.task.id] = res.goal;
      }
      for (const c of freqChanges) {
        // At or above the circle's interval CLEARS: a member may only come
        // round more often, never less (D51 on the frequency axis).
        const res = await setTaskFrequency(
          groupId,
          c.task.id,
          c.days >= c.task.frequencyDays ? null : c.days,
        );
        if (!res || res.error || res.frequency == null) {
          if (!failed.includes(c.task.label)) failed.push(c.task.label);
        } else appliedFreq[c.task.id] = res.frequency;
      }
    } catch {
      // Nothing landed for the rows we never reached; report the ones we know
      // about rather than pretending the whole save succeeded.
      for (const c of [...changes, ...freqChanges]) {
        if (
          applied[c.task.id] === undefined &&
          appliedFreq[c.task.id] === undefined &&
          !failed.includes(c.task.label)
        )
          failed.push(c.task.label);
      }
    } finally {
      setSaving(false);
    }

    // Hand back what LANDED, including on a partial failure — the rows that
    // saved are real and the screen must not keep showing the old numbers.
    if (Object.keys(applied).length > 0) onSaved(applied);
    if (Object.keys(appliedFreq).length > 0) onFrequencySaved(appliedFreq);

    if (failed.length > 0) {
      setDraft((d) => ({
        ...d,
        ...Object.fromEntries(
          Object.entries(applied).map(([id, g]) => [id, String(g)]),
        ),
      }));
      setFormError(
        `Couldn't save ${failed.join(", ")}. Try again in a moment.`,
      );
      return;
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      // Closable even mid-save. The buttons stay disabled so a save cannot be
      // fired twice, but Escape and the backdrop keep working: the writes are
      // already in flight and land regardless, closing does not navigate, and
      // Today reconciles from each write's own return rather than a refetch —
      // so there is nothing to protect by trapping the member behind a slow
      // network.
      onClose={onClose}
      title={
        linkTask
          ? "One act, many circles"
          : own
            ? ownTask
              ? "Your own task"
              : "Add a task for yourself"
            : "My goals"
      }
      description={
        linkTask
          ? `${linkTask.label} · only you can see this`
          : own
            ? // Said plainly, and it is the whole rule (D70): the circle can
              // SEE it, so this is not a private tracker — but nothing about it
              // touches what the circle is measured on.
              `${groupName} · yours to do, and it won't change the circle's total`
            : `${groupName} · only you can see these`
      }
      // A pane swap is a new view, so it starts at its own top.
      scrollKey={linkFor ?? (own ? `own:${own.taskId ?? "new"}` : "goals")}
      footer={
        own ? (
          <>
            <Button
              variant="ghost"
              leadingIcon={<ArrowLeftIcon />}
              disabled={ownSaving}
              onClick={() => setOwn(null)}
            >
              My goals
            </Button>
            <Button disabled={ownSaving} onClick={() => void saveOwn()}>
              {ownSaving ? "Saving…" : ownTask ? "Save" : "Add it"}
            </Button>
          </>
        ) : linkTask ? (
          // Nothing to commit here — a link writes immediately — so the pair is
          // "go back" and "leave", not "cancel" and "save".
          <>
            <Button
              variant="ghost"
              leadingIcon={<ArrowLeftIcon />}
              onClick={() => setLinkFor(null)}
            >
              My goals
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
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
        )
      }
    >
      {own ? (
        <OwnTaskPane
          draft={ownDraft}
          onChange={(patch) => {
            setOwnDraft((d) => ({ ...d, ...patch }));
            setOwnError(null);
          }}
          disabled={ownSaving}
          error={ownError}
          existing={ownTask}
          confirmRemove={confirmRemove}
          onArmRemove={() => setConfirmRemove(true)}
          onRemove={() => void removeOwn()}
        />
      ) : linkTask ? (
        <LinkPane
          task={linkTask}
          groupId={groupId}
          groupName={groupName}
          candidates={linkCandidates}
        />
      ) : tasks.length === 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            This circle has no tasks yet. Once an admin adds one, you can aim
            higher than the share it sets, and you can already add one of your
            own.
          </p>
          <AddOwnButton disabled={saving} onClick={() => openOwn(null)} />
        </>
      ) : (
        <>
          {/* The rule first, then what it costs you. Stated here as well as in
              the per-row error, because a member should learn the shape of the
              control BEFORE it refuses them — an error is the second-best place
              to explain a rule and the only place this one used to appear. */}
          <p className="text-sm text-muted-foreground">
            Your circle&rsquo;s share is the floor. You can aim{" "}
            <span className="font-medium text-foreground">above</span> it, never
            below. Your goal moves your ring and your celebration; never your
            streak, your consistency, or what the circle counts.
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
                    {/* MINE, not the circle's (D70). Said in a word rather than
                        by colour alone (§5), and it is also the door: a task I
                        added is the only one in this list whose name, target
                        and cycle are mine to change, so the badge that marks it
                        is the control that opens it. */}
                    {t.personal && (
                      <Button
                        variant="link"
                        size="inline"
                        disabled={saving}
                        onClick={() => openOwn(t)}
                        aria-label={`${t.label}. Your own task, edit it`}
                        className="tap-area-44 shrink-0 text-xs font-medium underline"
                      >
                        Yours &middot; edit
                      </Button>
                    )}
                    {stretched && (
                      <Button
                        variant="link"
                        size="inline"
                        disabled={saving}
                        onClick={() => setRow(t.id, String(t.target))}
                        // `size="inline"` carries no tap target by design —
                        // right for a word inside a sentence, wrong for this,
                        // which is a standalone control at the end of a row.
                        // The utility is a pseudo-element, so the 44px costs no
                        // layout and the baseline alignment above survives.
                        className="tap-area-44 shrink-0 text-xs font-medium underline"
                      >
                        Back to the circle&rsquo;s
                      </Button>
                    )}
                  </div>
                  {/* The member's own cycle, alongside their own number — the
                      same raise-only shape on the time axis. Only offered when
                      the circle is not already daily: there is nothing denser
                      than every day, so the control would be inert. */}
                  {t.frequencyDays > 1 && (
                    <div className="mt-3">
                      {/* `max` is the circle's own cycle: a looser interval is
                          not OFFERED rather than offered and refused. The
                          caption carries the rule, because a picker that simply
                          stops at "Every 3 days" does not say why. */}
                      <FrequencyPicker
                        id={`${inputId}-freq`}
                        label="How often"
                        disabled={saving}
                        max={t.frequencyDays}
                        value={Number(freqDraft[t.id] ?? t.frequencyDays)}
                        onChange={(d) => {
                          setFreqDraft((f) => ({ ...f, [t.id]: String(d) }));
                          setFormError(null);
                        }}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        Your circle asks for this{" "}
                        {frequencyLabel(t.frequencyDays).toLowerCase()} . You
                        can only go more often.
                      </p>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      id={inputId}
                      type="number"
                      inputMode="numeric"
                      min={t.target}
                      max={goalCap(t.target)}
                      disabled={saving}
                      aria-invalid={err ? true : undefined}
                      // The error first, then the floor. Without the error id
                      // here a screen reader announces "The circle asks 33"
                      // and nothing about why the save was refused.
                      aria-describedby={
                        err
                          ? `${inputId}-err ${inputId}-hint`
                          : `${inputId}-hint`
                      }
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
                  {err && (
                    <p
                      id={`${inputId}-err`}
                      className="mt-1.5 text-xs text-danger"
                    >
                      {err}
                    </p>
                  )}
                  {/* One act, many circles (D64) — on the task's own row (D66),
                      because "is this the same thing I do for my other circle?"
                      is a question about THIS task, asked while looking at it. */}
                  <TaskLinkSummary
                    task={t}
                    hasCandidates={linkCandidates.length > 0}
                    disabled={saving}
                    onOpen={() => setLinkFor(t.id)}
                  />
                </li>
              );
            })}
          </ul>

          {/* THE MEMBER'S OWN AXIS, third entry (D70). Beside "aim higher" and
              "come round more often" rather than under them: those two change
              how you meet what the circle asked, and this adds something it
              never asked for. It sits AFTER the list because the circle's work
              is what the member came here for. */}
          <AddOwnButton disabled={saving} onClick={() => openOwn(null)} />

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

/** The draft the own-pane edits. Strings throughout — these are inputs. */
type OwnDraft = {
  label: string;
  subtitle: string;
  target: string;
  frequency: string;
};

/** A new one starts at "once a day, once through" — the commonest shape a
 *  member tracks for themselves, and the least presumptuous default. */
const EMPTY_OWN: OwnDraft = {
  label: "",
  subtitle: "",
  target: "1",
  frequency: "1",
};

/** The door into the own-pane, from the goals list and from its empty state. */
function AddOwnButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // `min-h-11` and real padding rather than a `tap-area-44` overlay: this
      // is a box in its own right, so the 44px IS the control (TaskLinkSummary's
      // rule, one component along).
      className={cn(
        "mt-4 flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-brand)]",
        "hover:bg-surface-hover",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:text-disabled-foreground",
      )}
    >
      <PlusIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">
        Add a task for myself
      </span>
    </button>
  );
}

/**
 * A task of the member's own — the form, and the one place it can be removed.
 *
 * WHY THE MEMBER GETS THIS AT ALL. 0023 decided the opposite ("members do not
 * assign themselves") and it was right about the thing it was deciding: what
 * the circle asks of whom is the admin's, and nothing here touches that. This
 * is a third thing beside "what the circle asks" and "what I privately aim at"
 * (D51) — work the circle never asked for, carried by nobody but me.
 *
 * WHAT IT COSTS AND WHAT IT DOES NOT. It closes my rings, completes my day,
 * feeds my streak and my garden — everything that judges me alone, because
 * `private.obligations` reads the assignment interval and this task has one.
 * It is kept OUT of the circle's collective bar and out of the weekly standings
 * (0036), because a shared goal one member can inflate is not a shared goal and
 * a ranking you can climb by inventing work for yourself is not a ranking.
 *
 * The circle can SEE it, listed with my name against it exactly as any
 * single-assignee task has been since 0023 — so the description above says so
 * rather than letting the member assume otherwise.
 */
function OwnTaskPane({
  draft,
  onChange,
  disabled,
  error,
  existing,
  confirmRemove,
  onArmRemove,
  onRemove,
}: {
  draft: OwnDraft;
  onChange: (patch: Partial<OwnDraft>) => void;
  disabled: boolean;
  error: string | null;
  /** The task being changed, or null when one is being added. */
  existing: GoalRow | null;
  confirmRemove: boolean;
  onArmRemove: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Something you want to keep up that your circle hasn&rsquo;t asked for.
        It fills a ring like anything else and counts towards your day and your
        streak. Your circle can see it, but it won&rsquo;t move the
        circle&rsquo;s total or the weekly standings.
      </p>

      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="own-label" required>
          <Input
            id="own-label"
            disabled={disabled}
            maxLength={80}
            placeholder="Qur'an"
            value={draft.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </Field>
        <Field
          label="Note"
          htmlFor="own-subtitle"
          hint="Optional. A word about what it is."
        >
          <Input
            id="own-subtitle"
            disabled={disabled}
            maxLength={120}
            placeholder="A page after Fajr"
            value={draft.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
          />
        </Field>
        <Field
          label="How many"
          htmlFor="own-target"
          hint="What one full go looks like. The number that closes the ring."
        >
          <Input
            id="own-target"
            type="number"
            inputMode="numeric"
            min={1}
            disabled={disabled}
            className="w-28 tabular-nums"
            value={draft.target}
            onChange={(e) => onChange({ target: e.target.value })}
          />
        </Field>
        {/* No `max` here, unlike the per-task picker in the goals list. That
            one is capped at the circle's own cycle because a member may only
            come round MORE often than they were asked; nobody asked for this
            one, so the whole 1–14 range is theirs. */}
        <FrequencyPicker
          id="own-frequency"
          label="How often"
          disabled={disabled}
          value={Number(draft.frequency) || 1}
          onChange={(d) => onChange({ frequency: String(d) })}
        />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {/* REMOVE lives here and nowhere else. It is the only destructive control
          in this dialog, so it is one pane deep, at the bottom, and asks twice —
          the first tap arms it and the second does it. Nothing is soft-deleted:
          the logs go with the task, which is honest for work nobody but this
          member ever carried. */}
      {existing && (
        <div className="border-t border-border pt-4">
          {/* `destructive-outline` at rest, `destructive` once armed — the
              primitive's own rule: the filled red is for confirmed, final
              destruction, and shouting before the member has decided reads as
              a warning about something they have not done. */}
          <Button
            variant={confirmRemove ? "destructive" : "destructive-outline"}
            size="sm"
            disabled={disabled}
            onClick={confirmRemove ? onRemove : onArmRemove}
          >
            {confirmRemove ? "Yes, remove it" : "Remove this task"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {confirmRemove
              ? "This also removes what you've counted on it. It can't be undone."
              : "It stops appearing on your Today, for good."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The link control on a task's row in "My goals" — a DOORWAY, not the controls.
 *
 * D66 put this on the task row and was right about the place and wrong about
 * the size. What shipped was a single fuzzy suggestion, an unpadded 12px
 * "Remove" (a ~16px tap target against this repo's own 44px floor), and a
 * truncated "Circle · Task" that on a 360px phone had about twenty characters
 * to spend and ellipsised away the circle name the line exists to say. A member
 * with two links got two of those 16px targets six pixels apart, both
 * destructive.
 *
 * So the row now carries the one fact a member scans for — how many circles
 * this act already counts in — and everything else moved into a pane with room
 * for it.
 *
 * THAT FACT IS THE LIVE COUNT, never the cluster's size. A link into a circle
 * the member has left survives as a row and fans out to nothing, so counting it
 * here would have the row promise a write the app does not make. A cluster that
 * is ENTIRELY dormant says so instead of claiming "counts in 1 circle", which
 * is true of every task in the app and therefore tells the member nothing.
 *
 * SHOWN EVEN WITH NOTHING LINKED AND NOTHING SUGGESTED, whenever the member has
 * another circle at all. That is the discoverability half: the old row returned
 * null unless the matcher happened to guess, so two circles calling one act
 * "Salawat" and "Durood Shareef" left the member no way in — and no way to know
 * there was one.
 */
function TaskLinkSummary({
  task,
  hasCandidates,
  disabled,
  onOpen,
}: {
  task: GoalRow;
  hasCandidates: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  // The live count and the cluster's size are different numbers whenever a
  // circle has been left, and this row states the LIVE one — it is the number
  // of circles a tap actually reaches.
  const circles = liveCircleCount(task.links);
  const counting = circles > 1;
  const dormant = task.links.length - (circles - 1);

  // A door onto an empty room is worse than no door: a member in one circle,
  // with nothing linked, has nothing this pane could offer.
  if (task.links.length === 0 && !hasCandidates) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      // `min-h-11` and real padding, rather than a `tap-area-44` overlay: this
      // is a box in its own right, so the 44px IS the control.
      aria-label={
        counting
          ? `${task.label}. Counts in ${circles} circles, manage`
          : dormant > 0
            ? `${task.label}. Linked to ${dormant === 1 ? "a circle" : `${dormant} circles`} you have left, manage`
            : `${task.label}. Link to another circle`
      }
      className={cn(
        "mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-brand)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:text-disabled-foreground",
        // The tinted state means "this act is live in more than one circle".
        // A dormant-only cluster takes the plain treatment, because nothing is
        // being counted anywhere but here.
        counting
          ? "border-primary-200 bg-primary-50 hover:bg-primary-100"
          : "border-outline hover:bg-surface-hover",
      )}
    >
      <LinkIcon
        className={cn(
          "size-4 shrink-0",
          counting ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-xs">
        {counting ? (
          <span className="font-medium text-foreground">
            Counts in {circles} circles
          </span>
        ) : dormant > 0 ? (
          // Stated ahead of any suggestion: a standing link the member may want
          // to clear is a fact about their account, while a suggestion is only
          // an offer — and the pane carries the offer, badge and all, one tap
          // away.
          <span className="text-muted-foreground">
            Linked to {dormant === 1 ? "a circle" : `${dormant} circles`}{" "}
            you&rsquo;ve left
          </span>
        ) : task.linkSuggestion ? (
          <span className="text-muted-foreground">
            Also done in{" "}
            <span className="font-medium text-foreground">
              {task.linkSuggestion.groupName}
            </span>
            ?
          </span>
        ) : (
          <span className="text-muted-foreground">
            Also done in another circle?
          </span>
        )}
      </span>
      {/* Only beside the branch that names the suggested circle — a badge over
          any other sentence would be labelling something the row is not
          saying. */}
      {!counting && dormant === 0 && task.linkSuggestion && (
        <Badge variant="primary" size="sm" className="shrink-0">
          Match
        </Badge>
      )}
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** One circle in the link pane — its NAME on one line, the task under it. */
function CircleRow({
  name,
  label,
  badge,
  action,
  dim = false,
}: {
  name: string;
  label: string;
  badge?: React.ReactNode;
  action: React.ReactNode;
  dim?: boolean;
}) {
  return (
    // Two lines, not one. The old single line spent its width on "also counts
    // in " and then truncated the circle and the task together; stacked, each
    // gets the full column, which is what makes this readable on a phone.
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "min-w-0 truncate text-sm font-medium",
              dim ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {name}
          </p>
          {badge}
        </div>
        <p
          className="truncate text-xs text-muted-foreground"
          dir="auto"
          lang={langOf(label)}
        >
          {label}
        </p>
      </div>
      <div className="flex shrink-0 items-center">{action}</div>
    </li>
  );
}

/**
 * Everything one act's links can be, on one pane (D64/D66).
 *
 * WHAT THIS PANE MUST KEEP STRAIGHT, because the migration is careful about it
 * and a screen that blurred it would make the feature a lie:
 *
 *   * the RAW COUNT travels, the COMPLETION does not. Circle A asks 1 and circle
 *     B asks 500; logging 1 closes A and leaves B at 1-of-500, which is true.
 *   * each circle goes on judging its own task by its own target and its own
 *     share. Linking changes what a TAP does, never what a circle asks for.
 *
 * NOTHING IS EVER LINKED AUTOMATICALLY, and the MATCHER DECIDES NOTHING. It sets
 * the ORDER of the list and puts a "Match" badge on the pairs it likes; every
 * cross-circle task the member carries is offered regardless of what it is
 * called. That is the difference from D66, where the single fuzzy guess was the
 * only link that could ever be made — and a member whose circles disagreed
 * about the name had no way in and no way to know there was one.
 *
 * SEVERAL CIRCLES IS THE NORMAL CASE, not an edge one, and the pane is built to
 * say so: a "Counts in N circles" heading over a list that grows, and an "Add a
 * circle" section that stays open until the cluster is full. The old row's
 * one-suggestion-at-a-time reveal was reachable for a third circle but never
 * announced it — you found out by linking a second and noticing.
 *
 * It writes IMMEDIATELY, unlike every other control in this dialog — the goals
 * and cycles here are a set of numbers committed together on Save, but a link is
 * one irreversible-feeling claim about the member's own life, and burying it in
 * a batch would make "Cancel" ambiguous about whether the link happened. Its own
 * pending state, its own error, and `router.refresh()` via the action's
 * revalidate brings the new state back.
 */
function LinkPane({
  task,
  groupId,
  groupName,
  candidates,
}: {
  task: GoalRow;
  groupId: string;
  groupName: string;
  candidates: LinkableTask[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ error: string | null }>) {
    setError(null);
    setPending(key);
    try {
      const res = await fn();
      // `res` is typed non-null but the action redirects on a stale session,
      // which resolves the call to nothing — this dialog's standing guard.
      if (!res || res.error) {
        setError(res?.error ?? "Couldn't do that. Try again in a moment.");
        return;
      }
      // The action's `revalidatePath` is NOT enough on its own to reach a
      // client that stays mounted — `lib/use-action.ts` records that as racy
      // under load, and this dialog is the case it describes: it does not
      // unmount, so without an explicit refresh the pane goes on claiming the
      // link it just removed. Measured: the e2e unlink assertion failed on
      // exactly that stale row.
      router.refresh();
    } catch {
      setError("Couldn't do that. Try again in a moment.");
    } finally {
      setPending(null);
    }
  }

  // Two counts, deliberately: the heading states where a tap actually LANDS,
  // while the cap is about how many rows the cluster holds. A circle the member
  // has left is not counted in the first and very much occupies a slot in the
  // second — `link_tasks`' `count(*)` never asks about membership, so offering
  // on the live count would offer an eleventh the RPC refuses.
  const circles = liveCircleCount(task.links);
  // The migration refuses the eleventh regardless; stopping the OFFER here is
  // what turns that refusal into a sentence instead of a failed button.
  const atCap = clusterSize(task.links) >= MAX_CLUSTER_SIZE;
  const ranked = rankCandidates(
    { taskId: task.id, label: task.label, groupId, groupName },
    candidates,
    task.links.map((l) => l.taskId),
  );
  const busy = pending !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* The rule before the controls. Both halves are load-bearing and the
          migration is careful about them: the raw count travels and the
          COMPLETION does not, so a circle asking more shows you part-way rather
          than done — and each circle goes on judging its own task by its own
          target and share. Linking changes what a TAP does, never what a circle
          asks for. */}
      <p className="text-sm text-muted-foreground">
        Do it once, count it everywhere. Tapping this in any of these circles
        records the same number in all of them. Each circle keeps its own
        target, so one that asks for more just shows you part-way there.
      </p>

      <section>
        <h3 className="text-xs font-semibold text-muted-foreground">
          Counts in {circles} {circles === 1 ? "circle" : "circles"}
        </h3>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          <CircleRow
            name={groupName}
            label={task.label}
            action={
              <Badge variant="neutral" size="sm">
                This circle
              </Badge>
            }
          />
          {task.links.map((sibling) => (
            <CircleRow
              key={sibling.taskId}
              // The name is not withheld — it is UNKNOWN.
              // `tasks_select_member` hides a task in a circle the member has
              // left, which is exactly the state 0019's keep-the-row rule
              // creates, so inventing a placeholder would be the screen
              // claiming to know something it does not.
              dim={sibling.dormant}
              name={sibling.groupName ?? "A circle you've left"}
              label={sibling.label ?? "Its name isn't visible to you here"}
              badge={
                sibling.dormant ? (
                  <Badge variant="outline" size="sm" className="shrink-0">
                    Dormant
                  </Badge>
                ) : undefined
              }
              action={
                <Button
                  variant="destructive-outline"
                  size="sm"
                  // Out of the row's context — a screen reader running the
                  // controls of a pane with several circles — "Remove" alone
                  // says nothing about WHICH link is about to go.
                  aria-label={
                    sibling.groupName
                      ? `Stop counting ${task.label} in ${sibling.groupName}`
                      : `Stop counting ${task.label} in a circle you have left`
                  }
                  disabled={busy}
                  onClick={() =>
                    void run(sibling.taskId, () => unlinkTask(sibling.taskId))
                  }
                >
                  {pending === sibling.taskId ? "Removing…" : "Remove"}
                </Button>
              }
            />
          ))}
        </ul>
        {task.links.some((s) => s.dormant) && (
          <p className="mt-2 text-xs text-muted-foreground">
            A dormant circle is one you&rsquo;ve left. Nothing is counted there
            any more, so it isn&rsquo;t in the count above. The link is kept in
            case you rejoin, and you can clear it whenever you like.
          </p>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-muted-foreground">
          Add a circle
        </h3>
        {atCap ? (
          <p className="mt-2 text-sm text-muted-foreground">
            One act can cover up to {MAX_CLUSTER_SIZE} circles, and this one is
            full. Remove a circle above to add a different one.
          </p>
        ) : ranked.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {candidates.length === 0
              ? "You're only in one circle right now, so there's nothing to link this to."
              : "Every other circle you're in already counts this act."}
          </p>
        ) : (
          <>
            {/* Named as a hint, not a verdict. The matcher only ORDERS this
                list — every cross-circle task the member carries is here,
                whatever it is called, which is the whole point of the pane. */}
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {ranked.map((c) => (
                <CircleRow
                  key={c.task.taskId}
                  name={c.task.groupName}
                  label={c.task.label}
                  badge={
                    c.suggested ? (
                      <Badge variant="primary" size="sm" className="shrink-0">
                        Match
                      </Badge>
                    ) : undefined
                  }
                  action={
                    <Button
                      variant="tonal"
                      size="sm"
                      aria-label={`Also count ${task.label} in ${c.task.groupName} as ${c.task.label}`}
                      disabled={busy}
                      onClick={() =>
                        void run(c.task.taskId, () =>
                          linkTasks(task.id, c.task.taskId),
                        )
                      }
                    >
                      {pending === c.task.taskId ? "Linking…" : "Link"}
                    </Button>
                  }
                />
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Only you can see this, and you can link as many circles as you
              genuinely do this in, up to {MAX_CLUSTER_SIZE}.
            </p>
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
