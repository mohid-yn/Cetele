"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { acceptInvite } from "../actions";

/** Client leaf: the Accept button, submitting the accept_invite Server Action. */
export function AcceptButton({ code }: { code: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvite(code);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={submit}
      >
        {pending ? "Joining…" : "Join the group"}
      </Button>
      {error ? (
        <p role="alert" className="text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
