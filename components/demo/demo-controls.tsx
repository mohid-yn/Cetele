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
import { SparkIcon } from "./icons";

/**
 * "Act as" personas — the ownership model (D26) has no global roles to flip, so
 * the demo instead lets you *become* different people to see each per-group
 * role (owner / co-admin / member) first-hand. All three are in Fajr Circle so
 * the roles are directly comparable. Labelled by role, not just name.
 */
const PERSONAS: { id: string; role: string; name: string }[] = [
  { id: "u-1", role: "Owner", name: "Ahmad" },
  { id: "u-3", role: "Co-admin", name: "Aisha" },
  { id: "u-2", role: "Member", name: "Yusuf" },
];

export function DemoControls() {
  const { state, actions } = useMock();
  const { celebrate } = useCelebration();
  const [open, setOpen] = React.useState(false);
  const pending = state.pendingInvites[0];

  return (
    <div className="fixed right-3 bottom-24 z-[var(--z-overlay)] flex flex-col items-end gap-2 lg:bottom-6">
      {open && (
        <div className="w-60 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Demo controls
          </p>

          <p className="mb-1 px-1 text-xs text-muted-foreground">
            Act as <span className="opacity-70">(role in Fajr Circle)</span>
          </p>
          <div className="mb-1.5 flex flex-col gap-1">
            {PERSONAS.map((p) => {
              const active = state.session.currentUserId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => actions.setCurrentUser(p.id)}
                  className={
                    "flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground hover:bg-neutral-200")
                  }
                >
                  <span className="font-semibold">{p.role}</span>
                  <span className="opacity-75">{p.name}</span>
                </button>
              );
            })}
          </div>
          <p className="mb-3 px-1 text-[0.65rem] leading-tight text-muted-foreground">
            Super-admin isn&rsquo;t here — it&rsquo;s backend-only (set directly
            in Supabase).
          </p>

          <div className="flex flex-col gap-1.5">
            {pending && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.acceptInvite(pending.id)}
              >
                Accept email invite
              </Button>
            )}
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
            <Button
              size="sm"
              variant="outline"
              onClick={actions.toggleOwnerDormant}
            >
              {state.ui.ownerDormant ? "Owner active" : "Make owner dormant"}
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
