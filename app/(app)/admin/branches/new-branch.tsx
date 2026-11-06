"use client";

import * as React from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { PlusIcon } from "@/components/app/icons";
import { useAction } from "@/lib/use-action";
import { createBranch } from "./actions";

/** A new branch: one field, a name. Where it sits is where you pressed. */
export function NewBranchButton({
  parentId,
  label,
  parentName,
}: {
  parentId: string | null;
  label: string;
  parentName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const act = useAction();

  return (
    <>
      <Button
        size="sm"
        variant={parentId ? "tonal" : "accent"}
        onClick={() => {
          setName("");
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden className="size-4" />
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description={
          parentName
            ? `Inside ${parentName}. Its circles will hear about ${parentName}'s events too.`
            : "A new top-level branch, for an organisation of its own."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={act.pending || !name.trim()}
              onClick={() => void act.run(() => createBranch(parentId, name))}
            >
              {act.pending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Name"
            htmlFor="branch-name"
            hint="A place: a state, a city, a suburb."
          >
            <Input
              id="branch-name"
              value={name}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
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
