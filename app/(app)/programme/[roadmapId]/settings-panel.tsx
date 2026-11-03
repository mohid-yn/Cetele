"use client";

import * as React from "react";
import { Button, ConfirmDialog, Field, Input } from "@/components/ui";
import { useAction } from "@/lib/use-action";
import { deleteRoadmap, updateRoadmap } from "./authoring-actions";

/**
 * Name, dates and deletion. Delete is offered only while nobody has recorded
 * anything, because `delete_roadmap` refuses after that. The refusal still
 * surfaces if a member records something between render and press.
 */
export function SettingsPanel({
  roadmapId,
  name,
  startsOn,
  endsOn,
  recorded,
}: {
  roadmapId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  recorded: boolean;
}) {
  const [form, setForm] = React.useState({ name, startsOn, endsOn });
  const [saved, setSaved] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const save = useAction();
  const remove = useAction();

  const dirty =
    form.name !== name || form.startsOn !== startsOn || form.endsOn !== endsOn;
  const badDates = form.endsOn < form.startsOn;
  const change = (patch: Partial<typeof form>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || badDates || form.name.trim() === "") return;
          void save.run(
            () =>
              updateRoadmap(roadmapId, form.name, form.startsOn, form.endsOn),
            () => setSaved(true),
          );
        }}
      >
        <Field label="Name" htmlFor="roadmap-name" required>
          <Input
            id="roadmap-name"
            value={form.name}
            autoComplete="off"
            onChange={(e) => change({ name: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opens" htmlFor="roadmap-start">
            <Input
              id="roadmap-start"
              type="date"
              value={form.startsOn}
              onChange={(e) => change({ startsOn: e.target.value })}
            />
          </Field>
          <Field
            label="Closes"
            htmlFor="roadmap-end"
            error={badDates ? "Must be after it opens." : undefined}
          >
            <Input
              id="roadmap-end"
              type="date"
              value={form.endsOn}
              onChange={(e) => change({ endsOn: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={
              !dirty || badDates || save.pending || form.name.trim() === ""
            }
          >
            {save.pending ? "Saving…" : "Save changes"}
          </Button>
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {saved && !dirty ? "Saved." : ""}
          </span>
        </div>
        {save.error && (
          <p role="alert" className="text-sm text-danger">
            {save.error}
          </p>
        )}
      </form>

      <div className="rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Delete this roadmap
        </h2>
        {recorded ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Members have recorded work on it, so it can&rsquo;t be deleted.
            Withdrawing it hides it and keeps every record.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Removes it and everything in it. Nobody has recorded any work on
              it yet.
            </p>
            <Button
              variant="destructive-outline"
              className="mt-3"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          </>
        )}
        {remove.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {remove.error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this roadmap?"
        description={`“${name}” and everything in it will be removed. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() =>
          void remove.run(
            () => deleteRoadmap(roadmapId),
            () => setConfirming(false),
          )
        }
      />
    </div>
  );
}
