import * as React from "react";
import { cn } from "@/lib/utils";

/** A consistent section label, with an optional trailing action/meta slot. */
export function SectionHeading({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-2 flex items-center justify-between gap-2", className)}
    >
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {action != null && (
        <div className="shrink-0 text-xs text-muted-foreground">{action}</div>
      )}
    </div>
  );
}
