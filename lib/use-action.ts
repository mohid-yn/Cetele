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
  const run = async <R extends { error: string | null }>(
    fn: () => Promise<R>,
    /** Runs on success. Receives the action's result, so a caller can apply an
     *  optimistic update from what the action returned (e.g. the new row). */
    after?: (res: R) => void,
    /** Undo optimistic UI — without it a refused write still *looks* applied. */
    onError?: () => void,
  ) => {
    setError(null);
    setPending(true);
    let res: R;
    try {
      res = await fn();
    } catch (e) {
      // A REJECTED action (network drop mid-flight, a browser API throwing) is
      // not a redirect — a redirecting Server Action resolves undefined on the
      // client, it doesn't throw. Without this catch the rejection escaped as
      // unhandled and `pending` stayed true forever (a button stuck "Saving…").
      setError(
        e instanceof Error ? e.message : "Something went wrong — try again.",
      );
      onError?.();
      return;
    } finally {
      setPending(false);
    }
    if (res?.error) {
      setError(res.error);
      onError?.();
    } else {
      after?.(res);
      // Reconcile in the background. The manage lists apply their change
      // optimistically in `after` (CET-30) so the UI is correct regardless of
      // whether this refresh lands — a router.refresh() right after a Server
      // Action's own revalidatePath can coalesce and be dropped. A redirecting
      // action returns nothing, so it is skipped (no refetching a route we left).
      if (res) router.refresh();
    }
  };
  return { pending, error, run };
}
