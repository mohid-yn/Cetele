"use client";

import * as React from "react";
import type { MemberRole } from "@/lib/roles";

/** Token-styled native <select> className, shared by the admin forms. */
export const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none " +
  // Token pair, never opacity — see input.tsx.
  "disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-fill disabled:text-disabled-foreground";

/**
 * Member / Co-admin segmented control — clearer than a dropdown for a binary
 * role. Only ever toggles between `member` and `admin` (co-admin); ownership is
 * changed via transfer, never here (D26).
 */
export function RoleToggle({
  value,
  onChange,
  disabled,
}: {
  value: MemberRole;
  onChange: (r: MemberRole) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {(["member", "admin"] as MemberRole[]).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={
            // min-h-11 = 44px. Was `py-1` → a 24px target: at or under the
            // WCAG 2.5.8 (AA) floor and well under the 44 (Fluent 2 / Apple)
            // and 48dp (Material 3) recommendations this app already follows
            // elsewhere. Two adjacent segments can't use invisible hit-area
            // expansion without overlapping each other, so the segments grow.
            // `disabled:opacity-40` here was the worst instance of the family:
            // it faded the ACTIVE segment's sage fill and its near-white label
            // together, measured at **1.85:1** — the exact 2.16:1-class failure
            // the Button primitive documents at the top of its own file.
            "flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors " +
            "disabled:cursor-not-allowed " +
            (value === r
              ? "bg-primary text-primary-foreground disabled:bg-disabled-fill disabled:text-disabled-foreground"
              : "text-muted-foreground hover:text-foreground disabled:text-disabled-foreground")
          }
        >
          {r === "member" ? "Member" : "Co-admin"}
        </button>
      ))}
    </div>
  );
}
