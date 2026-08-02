"use client";

import * as React from "react";
import { Avatar, Button, Dialog } from "@/components/ui";
import { CheckIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import type { ManageMember } from "./manage-client";
import { setTaskAssignees } from "./actions";

/**
 * Who a task is for (0023, D54).
 *
 * Two settings, not one list. "Everyone" is its own choice rather than "all the
 * boxes happen to be ticked", because the two behave differently the moment
 * somebody joins: an everyone-task is picked up by next week's joiner
 * automatically, a task ticked for five people who happen to be everyone is
 * not. Collapsing them would silently pick the wrong one for the common case.
 *
 * Each row is a `Button`, not a bare `<button>` with a checkbox: the row IS the
 * target (full width, 44px), which is what makes it usable one-handed, and the
 * primitive carries the focus ring, the pressed state and the disabled token
 * pair that seventeen hand-rolled controls in this app had quietly opted out of.
 * Selection is the `--primary-container` token pair, the same fill the nav's
 * active item uses — never an alpha over an unknown surface.
 */

/** Shared shape for the two kinds of selectable row in this dialog. */
function pickRowClass(selected: boolean): string {
  return (
    "w-full justify-start h-auto min-h-11 py-2 text-left font-normal " +
    (selected
      ? "border-primary bg-primary-container text-on-primary-container"
      : "")
  );
}

export function AssigneesDialog({
  open,
  onClose,
  groupId,
  taskId,
  taskLabel,
  members,
  assignees,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  taskId: string;
  taskLabel: string;
  members: ManageMember[];
  /** `null` = everyone. */
  assignees: string[] | null;
  onSaved: (assignees: string[] | null) => void;
}) {
  const { pending, error, run } = useAction();
  const [everyone, setEveryone] = React.useState(assignees === null);
  const [picked, setPicked] = React.useState<string[]>(assignees ?? []);

  // Re-seed when the dialog is opened on a different task. Done during render
  // rather than in an effect: this repo lints set-state-in-effect, and an effect
  // also seeds one render late, flashing the previous task's assignees.
  const [seededFor, setSeededFor] = React.useState(taskId);
  if (seededFor !== taskId) {
    setSeededFor(taskId);
    setEveryone(assignees === null);
    setPicked(assignees ?? []);
  }

  const toggle = (userId: string) =>
    setPicked((p) =>
      p.includes(userId) ? p.filter((id) => id !== userId) : [...p, userId],
    );

  // `set_task_assignees` refuses an empty set. Refusing it here too means the
  // admin is told by the screen rather than by a raw server error.
  const emptyPick = !everyone && picked.length === 0;

  const save = () =>
    run(
      () => setTaskAssignees(groupId, taskId, everyone ? null : picked),
      (res) => {
        onSaved(res?.assignees ?? null);
        onClose();
      },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Who is this for?"
      description={taskLabel}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={save}
            disabled={pending || emptyPick}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          aria-pressed={everyone}
          onClick={() => setEveryone(true)}
          className={pickRowClass(everyone)}
        >
          <span className="flex-1 font-medium">Everyone</span>
          {everyone && <CheckIcon />}
        </Button>

        <div className="my-1 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or pick people</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {members.map((m) => {
          const on = !everyone && picked.includes(m.userId);
          return (
            <Button
              key={m.userId}
              variant="outline"
              aria-pressed={on}
              onClick={() => {
                setEveryone(false);
                toggle(m.userId);
              }}
              className={pickRowClass(on)}
            >
              <Avatar
                name={m.name}
                src={m.avatarUrl ?? undefined}
                className="size-7"
              />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {on && <CheckIcon />}
            </Button>
          );
        })}

        {emptyPick && (
          <p role="alert" className="text-xs text-danger">
            Pick at least one person, or choose Everyone — a task nobody carries
            would sit on no one&apos;s Today.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
