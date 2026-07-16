"use client";

import * as React from "react";

/**
 * Local state seeded from a prop, re-seeded whenever the prop's identity changes
 * (a genuine server refetch / navigation delivers a new value). React's endorsed
 * "adjust state during render" pattern — no effect, so no set-state-in-effect —
 * lets a control apply a mutation optimistically (CET-30) while still picking up
 * server-driven changes (e.g. an ownership transfer, or the reconciliation after
 * a mixed-outcome pair of saves) when they arrive.
 */
export function usePropState<T>(
  prop: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState(prop);
  const [seed, setSeed] = React.useState(prop);
  if (prop !== seed) {
    setSeed(prop);
    setState(prop);
  }
  return [state, setState];
}
