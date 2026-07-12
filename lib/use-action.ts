"use client";

import * as React from "react";

/**
 * Run a Server Action inside a transition, surfacing its error.
 *
 * `res?.error` is optional-chained on purpose: an action that redirects (e.g.
 * leaveGroup) navigates instead of returning, so there is no result to read.
 */
export function useAction() {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (
    fn: () => Promise<{ error: string | null }>,
    after?: () => void,
  ) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else after?.();
    });
  };
  return { pending, error, run };
}
