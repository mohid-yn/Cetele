"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { PlusIcon } from "@/components/app/icons";
import { createGroup } from "./actions";

/** Client leaf: the "New group" button + dialog, submitting a Server Action. */
export function NewGroupButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Deliberately NOT wrapped in a useTransition.
   *
   * The new circle was intermittently missing from the list afterwards — the row
   * was in the DB, `auth.uid()` resolved, no query errored, and the page had
   * simply rendered its pre-create state. The refetch was being dropped: closing
   * the dialog unmounts a portalled subtree in the SAME transition that carries
   * the action's re-render, and under load the router update lost the race.
   *
   * So the sequence is made explicit and un-batched instead: await the write,
   * close the dialog, then refresh. `pending` is plain state — all the
   * transition was buying here was the disabled button, which this gives us
   * without putting the refetch in a race it can lose.
   */
  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await createGroup(name);
    setPending(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    setName("");
    setOpen(false);
    router.refresh();
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
