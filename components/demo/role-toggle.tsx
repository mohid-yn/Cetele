"use client";

import * as React from "react";
import type { MemberRole } from "@/lib/mock/types";

/** Token-styled native <select> className, shared by the admin forms. */
export const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-50";

/** Member / Admin segmented control — clearer than a dropdown for a binary role. */
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
      {(["member", "group_admin"] as MemberRole[]).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 " +
            (value === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {r === "member" ? "Member" : "Admin"}
        </button>
      ))}
    </div>
  );
}
