"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { PlusIcon } from "@/components/app/icons";
import { groupHref } from "@/lib/group-href";
import { createGroup } from "./actions";

/** Client leaf: the "New group" button + dialog, submitting a Server Action. */
export function NewGroupButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * On success we NAVIGATE into the new circle rather than refetch the list we
   * are on (CET-30). The list was intermittently missing the new circle even
   * though the write succeeded — refetching `/groups` in place raced the dialog
   * unmount and the router update was dropped under load. A route change is a
   * guaranteed server fetch, so it can't lose that race; Manage is also the
   * natural next step (you just made a circle — now add its tasks).
   */
  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await createGroup(name);

    if (res.error) {
      setPending(false);
      setError(res.error);
      return;
    }
    setName("");
    setOpen(false);
    if (res.groupId) {
      router.push(groupHref(res.groupId, "/group/manage"));
    } else {
      router.refresh(); // no id came back — at least refetch the list
    }
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
