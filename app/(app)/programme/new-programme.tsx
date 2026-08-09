"use client";

import * as React from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { PlusIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { createRoadmap } from "./actions";

/**
 * Start a programme (D59). Organisers only — the hub renders this at all only
 * for them, and `create_roadmap` refuses everyone else regardless.
 *
 * THREE FIELDS, and no more. A programme is a name and a window; the work
 * inside it is added on the screen this opens, one item at a time, because a
 * single form that created a programme AND its forty-six items would be a form
 * nobody finishes. The action redirects into the new programme for that reason.
 *
 * The dates default to the calendar year the organiser is standing in, which is
 * what a yearly programme almost always is (D55: a new year opens a new row).
 * Both are still editable — a Ramadan programme is two months, not twelve.
 */
export function NewProgrammeButton() {
  const [open, setOpen] = React.useState(false);
  const thisYear = new Date().getFullYear();
  const [name, setName] = React.useState("");
  const [startsOn, setStartsOn] = React.useState(`${thisYear}-01-01`);
  const [endsOn, setEndsOn] = React.useState(`${thisYear}-12-31`);
  const act = useAction();

  const openDialog = () => {
    setName("");
    setStartsOn(`${thisYear}-01-01`);
    setEndsOn(`${thisYear}-12-31`);
    setOpen(true);
  };

  return (
    <>
      <Button variant="accent" size="sm" onClick={openDialog}>
        <PlusIcon aria-hidden className="size-4" />
        New programme
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New programme"
        description="It starts unpublished, so no circle sees it until you say so."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={act.pending || name.trim() === ""}
              onClick={() =>
                void act.run(() => createRoadmap(name, startsOn, endsOn))
              }
            >
              {act.pending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Name"
            htmlFor="new-programme-name"
            hint="What the administration calls it."
          >
            <Input
              id="new-programme-name"
              value={name}
              autoComplete="off"
              placeholder="Islamic Development Program"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="flex gap-3">
            <Field
              label="Opens"
              htmlFor="new-programme-start"
              className="flex-1"
            >
              <Input
                id="new-programme-start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </Field>
            <Field
              label="Closes"
              htmlFor="new-programme-end"
              className="flex-1"
            >
              <Input
                id="new-programme-end"
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </Field>
          </div>

          {act.error && (
            <p role="alert" className="text-sm text-danger">
              {act.error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
