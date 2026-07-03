"use client";

import * as React from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { PlusIcon } from "@/components/demo/icons";
import { createGroup } from "./actions";

/** Client leaf: the "New group" button + dialog, submitting a Server Action. */
export function NewGroupButton() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createGroup(name);
      if (res.error) {
        setError(res.error);
      } else {
        setName("");
        setOpen(false);
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="accent"
        leadingIcon={<PlusIcon />}
        onClick={() => setOpen(true)}
      >
        New group
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New group"
        description="You'll be the owner — you can share it with co-admins afterwards."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim() || pending}
              onClick={submit}
            >
              {pending ? "Creating…" : "Create group"}
            </Button>
          </>
        }
      >
        <Field label="Group name" htmlFor="new-group-name" required>
          <Input
            id="new-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Isha Circle"
            autoFocus
          />
        </Field>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
