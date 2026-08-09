"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
} from "@/components/ui";
import { PencilIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import {
  deleteRoadmap,
  setRoadmapPublished,
  updateRoadmap,
} from "./authoring-actions";

/**
 * The programme's own controls (D59): rename it, move its window, publish or
 * withdraw it, delete it.
 *
 * PUBLISH IS THE LOAD-BEARING ONE. A programme is born unpublished and is
 * invisible to every circle until this is flipped (`roadmaps_select_published`,
 * 0025) — so the organiser builds it in the open without anybody watching a
 * half-finished list. Withdrawing is the same switch backwards and destroys
 * nothing: circles stay followed, records stay recorded, and publishing again
 * puts everyone back exactly where they were.
 *
 * DELETE IS OFFERED ONLY WHERE IT CAN SUCCEED. `delete_roadmap` refuses once
 * anybody has recorded work — that guard is the database's and is what actually
 * protects the records — but a button that always fails is not a control, so
 * the screen asks the same question and shows the alternative instead. The
 * refusal message still surfaces if the two ever disagree (a member recording
 * between the render and the press, which is exactly the race a UI check cannot
 * close).
 */
export function ProgrammeAdmin({
  roadmapId,
  name,
  startsOn,
  endsOn,
  published,
  recorded,
}: {
  roadmapId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  published: boolean;
  /** Anyone recorded work on it? Decides delete vs "withdraw instead". */
  recorded: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [form, setForm] = React.useState({ name, startsOn, endsOn });
  const edit = useAction();
  const publish = useAction();
  const remove = useAction();

  const openEditor = () => {
    setForm({ name, startsOn, endsOn });
    setEditing(true);
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {published ? "Published" : "Draft"}
          </span>
          <Badge variant={published ? "primary" : "neutral"} size="sm">
            {published ? "every circle can follow it" : "only you can see it"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openEditor}>
            <PencilIcon aria-hidden className="size-4" />
            Name &amp; dates
          </Button>
          <Button
            variant={published ? "outline" : "accent"}
            size="sm"
            disabled={publish.pending}
            onClick={() =>
              void publish.run(() => setRoadmapPublished(roadmapId, !published))
            }
          >
            {publish.pending ? "Saving…" : published ? "Withdraw" : "Publish"}
          </Button>
          {/* No delete button at all once work is recorded — the same shape the
              organiser roster uses for the last organiser (D56): a control that
              cannot succeed should not be offered. */}
          {!recorded && (
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {recorded && (
        <p className="text-xs text-muted-foreground">
          Members have recorded work on this programme, so it can no longer be
          deleted. Withdrawing it takes it off every circle&rsquo;s screen and
          keeps every record.
        </p>
      )}

      {(publish.error || remove.error) && (
        <p role="alert" className="text-sm text-danger">
          {publish.error ?? remove.error}
        </p>
      )}

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Name & dates"
        description="Neither changes what finishing means, so both stay editable for the life of the programme."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={edit.pending || form.name.trim() === ""}
              onClick={() =>
                void edit.run(
                  () =>
                    updateRoadmap(
                      roadmapId,
                      form.name,
                      form.startsOn,
                      form.endsOn,
                    ),
                  () => setEditing(false),
                )
              }
            >
              {edit.pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="programme-name" required>
            <Input
              id="programme-name"
              value={form.name}
              autoComplete="off"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="flex gap-3">
            <Field label="Opens" htmlFor="programme-start" className="flex-1">
              <Input
                id="programme-start"
                type="date"
                value={form.startsOn}
                onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
              />
            </Field>
            <Field label="Closes" htmlFor="programme-end" className="flex-1">
              <Input
                id="programme-end"
                type="date"
                value={form.endsOn}
                onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
              />
            </Field>
          </div>
          {edit.error && (
            <p role="alert" className="text-sm text-danger">
              {edit.error}
            </p>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this programme?"
        description={`“${name}” and everything in it will be removed. Nobody has recorded any work on it, so nothing anyone earned is lost.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          void remove.run(
            () => deleteRoadmap(roadmapId),
            () => setConfirming(false),
          )
        }
      />
    </Card>
  );
}
