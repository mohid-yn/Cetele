"use client";

import * as React from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
} from "@/components/ui";
import { PlusIcon } from "@/components/app/icons";
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
 * THE WORDING IS ALWAYS EDITABLE; THE LEVEL IS NOT, once anybody has recorded
 * work. A reward's threshold is a promise about how much work earns it, so it
 * freezes with everything else completion depends on — but its label and
 * description are the administration describing what it hands over, and that
 * is exactly the thing still unsettled (the "$1,000 per level toward the
 * international trip" was a working figure). This editor is what closes that
 * question without a migration, on a programme already under way.
 */
export function RewardsEditor({
  roadmapId,
  rewards,
  recorded,
}: {
  roadmapId: string;
  rewards: EditableReward[];
  /** Anyone recorded work on this programme? Freezes thresholds and removal. */
  recorded: boolean;
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
        ? { threshold: String(rewards.length + 1), label: "", description: "" }
        : {
            threshold: String(reward.threshold),
            label: reward.label,
            description: reward.description ?? "",
          },
    );
    setEditing(reward);
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Rewards</h3>
        {/* A new reward changes what the ladder promises, so it is offered only
            while nothing has been recorded — the same rule the RPC enforces. */}
        {!recorded && (
          <Button variant="outline" size="sm" onClick={() => open("new")}>
            <PlusIcon aria-hidden className="size-4" />
            Add
          </Button>
        )}
      </div>

      {rewards.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No rewards yet. A reward unlocks when a member has finished that many
          levels.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {rewards.map((r) => (
            <li key={r.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.label}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  at {r.threshold} {r.threshold === 1 ? "level" : "levels"}
                  {r.description ? ` · ${r.description}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => open(r)}>
                Edit
              </Button>
              {!recorded && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => setRemoving(r)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {recorded && (
        <p className="text-xs text-muted-foreground">
          Members have recorded work, so a reward&rsquo;s level is fixed and
          none can be added or removed. What it says it gives is still yours to
          edit.
        </p>
      )}

      {remove.error && (
        <p role="alert" className="text-sm text-danger">
          {remove.error}
        </p>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add a reward" : "Edit reward"}
        description="What the administration gives, and how many finished levels earn it."
        footer={
          <>
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
                      id:
                        editing === "new" || editing === null
                          ? null
                          : editing.id,
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
        <div className="flex flex-col gap-4">
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
            hint="The administration's own words. Editable at any time."
          >
            <Input
              id="reward-description"
              value={form.description}
              autoComplete="off"
              placeholder="$1,000 toward the international trip"
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          <Field
            label="Unlocks at"
            htmlFor="reward-threshold"
            className="w-40"
            hint="Finished levels"
          >
            <Input
              id="reward-threshold"
              type="number"
              min={1}
              inputMode="numeric"
              disabled={recorded}
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            />
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
        destructive
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          void remove.run(
            () => deleteRoadmapReward(target.id),
            () => setRemoving(null),
          );
        }}
      />
    </Card>
  );
}
