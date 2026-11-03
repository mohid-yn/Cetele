"use client";

import * as React from "react";
import { Button, ConfirmDialog, Dialog, Field, Input } from "@/components/ui";
import { ChevronRightIcon, LockIcon, PlusIcon } from "@/components/app/icons";
import { selectCls } from "@/components/app/role-toggle";
import { useAction } from "@/lib/use-action";
import { deleteRoadmapReward, upsertRoadmapReward } from "./authoring-actions";

export type EditableReward = {
  id: string;
  threshold: number;
  label: string;
  description: string | null;
};

/**
 * What the administration gives, and at which level (D55, D59).
 *
 * The wording stays editable for good, because it is the administration
 * describing what it hands over. The level freezes once anyone has recorded work,
 * because it is a promise about how much work earns the reward. The level is a
 * picker over the levels that exist, so a reward nobody could reach can't be
 * typed in by accident.
 */
export function RewardsEditor({
  roadmapId,
  rewards,
  recorded,
  levelCount,
}: {
  roadmapId: string;
  rewards: EditableReward[];
  /** Anyone recorded work on this roadmap? Freezes thresholds and removal. */
  recorded: boolean;
  levelCount: number;
}) {
  const [editing, setEditing] = React.useState<EditableReward | "new" | null>(
    null,
  );
  const [removing, setRemoving] = React.useState<EditableReward | null>(null);
  const save = useAction();
  const remove = useAction();
  const [form, setForm] = React.useState({
    threshold: "1",
    label: "",
    description: "",
  });

  const open = (reward: EditableReward | "new") => {
    setForm(
      reward === "new"
        ? {
            threshold: String(
              Math.min(rewards.length + 1, Math.max(levelCount, 1)),
            ),
            label: "",
            description: "",
          }
        : {
            threshold: String(reward.threshold),
            label: reward.label,
            description: reward.description ?? "",
          },
    );
    setEditing(reward);
  };

  const editingReward = editing !== "new" ? editing : null;
  const choices = Array.from(
    new Set([
      ...Array.from({ length: Math.max(levelCount, 1) }, (_, i) => i + 1),
      ...(editingReward ? [editingReward.threshold] : []),
    ]),
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A reward unlocks when a member has finished that many levels.
      </p>

      {rewards.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {rewards.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-label={`Edit ${r.label}`}
                onClick={() => open(r)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-[var(--duration-fast)] first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-hover active:bg-surface-active"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium wrap-anywhere text-foreground">
                    {r.label}
                  </span>
                  <span className="mt-0.5 block text-xs wrap-anywhere text-muted-foreground">
                    After {r.threshold} {r.threshold === 1 ? "level" : "levels"}
                    {r.description ? ` · ${r.description}` : ""}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {recorded ? (
        <p className="flex gap-2 text-sm text-muted-foreground">
          <LockIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          Members have recorded work, so rewards can&rsquo;t be added or
          removed, and their levels are fixed. The wording can still change.
        </p>
      ) : (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => open("new")}
        >
          <PlusIcon aria-hidden />
          Add reward
        </Button>
      )}

      {remove.error && (
        <p role="alert" className="text-sm text-danger">
          {remove.error}
        </p>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add reward" : "Edit reward"}
        footer={
          <>
            {editingReward && !recorded && (
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                onClick={() => {
                  setEditing(null);
                  setRemoving(editingReward);
                }}
              >
                Remove
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={save.pending || form.label.trim() === ""}
              onClick={() =>
                void save.run(
                  () =>
                    upsertRoadmapReward(roadmapId, {
                      id: editingReward?.id ?? null,
                      threshold: parseInt(form.threshold, 10) || 1,
                      label: form.label,
                      description: form.description,
                    }),
                  () => setEditing(null),
                )
              }
            >
              {save.pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-1">
          <Field label="Label" htmlFor="reward-label" required>
            <Input
              id="reward-label"
              value={form.label}
              autoComplete="off"
              placeholder="Level 1 complete"
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>
          <Field
            label="What it gives"
            htmlFor="reward-description"
            hint="Can be edited at any time."
          >
            <Input
              id="reward-description"
              value={form.description}
              autoComplete="off"
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          <Field label="Unlocks after" htmlFor="reward-threshold">
            <select
              id="reward-threshold"
              className={selectCls}
              disabled={recorded}
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            >
              {choices.map((n) => (
                <option key={n} value={n}>
                  {n} finished {n === 1 ? "level" : "levels"}
                </option>
              ))}
            </select>
          </Field>
          {save.error && (
            <p role="alert" className="text-sm text-danger">
              {save.error}
            </p>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this reward?"
        description={
          removing
            ? `“${removing.label}” comes off the ladder every member sees.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          void remove.run(
            () => deleteRoadmapReward(target.id),
            () => setRemoving(null),
          );
        }}
      />
    </div>
  );
}
