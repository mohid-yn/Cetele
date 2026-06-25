"use client";

/**
 * Floating Demo Controls — the panel used to drive a stakeholder walkthrough.
 * Flip roles, reset, jump a day forward (to show streak + forgiveness), fire a
 * milestone, and toggle the demo ribbon. Clearly a demo tool, not product UI.
 */

import * as React from "react";
import { Button } from "@/components/ui";
import { useMock } from "@/lib/mock/store";
import { useCelebration } from "./celebration";
import type { ViewRole } from "@/lib/mock/types";
import { SparkIcon } from "./icons";

const ROLES: { value: ViewRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "group_admin", label: "Group admin" },
  { value: "admin", label: "App admin" },
];

export function DemoControls() {
  const { state, actions } = useMock();
  const { celebrate } = useCelebration();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="fixed right-3 bottom-24 z-[var(--z-overlay)] flex flex-col items-end gap-2 lg:bottom-6">
      {open && (
        <div className="w-60 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Demo controls
          </p>

          <p className="mb-1 px-1 text-xs text-muted-foreground">View as</p>
          <div className="mb-3 grid grid-cols-3 gap-1">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => actions.setViewRole(r.value)}
                className={
                  "rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors " +
                  (state.session.viewRole === r.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-neutral-200")
                }
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Button
              size="sm"
              variant="accent"
              leadingIcon={<SparkIcon />}
              onClick={() => celebrate()}
            >
              Trigger milestone
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={actions.fastForwardDay}
            >
              Fast-forward a day
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.setFreshStart(!state.ui.freshStart)}
            >
              {state.ui.freshStart ? "Clear" : "Trigger"} fresh-start
            </Button>
            <Button size="sm" variant="ghost" onClick={actions.toggleRibbon}>
              {state.ui.showRibbon ? "Hide" : "Show"} demo ribbon
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-500/10"
              onClick={() => {
                if (confirm("Reset the demo to its starting state?"))
                  actions.reset();
              }}
            >
              Reset demo
            </Button>
          </div>
        </div>
      )}

      <Button
        size="icon"
        variant={open ? "primary" : "accent"}
        aria-label="Demo controls"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full shadow-lg"
      >
        {open ? "✕" : <SparkIcon />}
      </Button>
    </div>
  );
}
