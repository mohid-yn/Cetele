import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One consistent page header across every screen: title (left) + an optional
 * subtitle, and a single action/stat slot (right). Keeping every screen on this
 * one pattern is most of what makes the app read as "designed" rather than
 * hand-assembled. `title` accepts a node so callers can pass a custom element
 * (e.g. the group switcher or a greeting block) instead of a plain string.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? (
          <h1 className="font-display text-2xl font-bold text-foreground">
            {title}
          </h1>
        ) : (
          title
        )}
        {subtitle != null && (
          <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </header>
  );
}
