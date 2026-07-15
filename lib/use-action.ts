"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Run a Server Action inside a transition, surfacing its error.
 *
 * `res?.error` is optional-chained on purpose: an action that redirects (e.g.
 * leaveGroup) navigates instead of returning, so there is no result to read.
 *
 * On success it also `router.refresh()`es (CET-30). Every action here already
 * `revalidatePath`s, but relying on that implicit revalidation to reach the
 * client was racy under load — the in-place list (invites, members, tasks)
 * intermittently kept its pre-mutation state even though the write landed. An
 * explicit refresh makes the update deterministic. These callers stay mounted
 * (an inline panel, not a dialog that unmounts), so the refresh reliably lands.
 * A redirecting action returns nothing, so it is skipped — no refetching a route
 * we have already left.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (
    fn: () => Promise<{ error: string | null }>,
    after?: () => void,
    /** Undo optimistic UI — without it a refused write still *looks* applied. */
    onError?: () => void,
  ) => {
    setError(null);
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res?.error) {
      setError(res.error);
      onError?.();
    } else {
      after?.();
      // Not inside a useTransition (CET-30): a transition DEPRIORITISES this
      // refresh, so under load it was arriving after the assertion window — the
      // manage list (invites/members/tasks) kept its pre-mutation state though
      // the write had landed. A plain refresh on a mounted screen lands promptly.
      if (res) router.refresh();
    }
  };
  return { pending, error, run };
}
