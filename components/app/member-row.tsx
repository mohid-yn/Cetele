import * as React from "react";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/roles";

/**
 * One circle member, rendered consistently wherever we list people (the Today
 * circle strip, the Group members section). Layout-only — callers supply the
 * wrapper (a card, an <li>, …) and the trailing/leading slots, so it stays
 * flexible without each screen re-inventing the avatar + name + role markup.
 */
export function MemberRow({
  name,
  role,
  you,
  status,
  leading,
  trailing,
  avatarSize = "sm",
  className,
}: {
  name: string;
  role?: MemberRole;
  you?: boolean;
  /** Optional secondary line under the name. */
  status?: React.ReactNode;
  /** Optional slot before the avatar (e.g. a rank). */
  leading?: React.ReactNode;
  /** Optional slot at the end (e.g. a count or score). */
  trailing?: React.ReactNode;
  avatarSize?: React.ComponentProps<typeof Avatar>["size"];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {leading}
      <Avatar name={name} size={avatarSize} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {/* The NAME truncates; the badges stay pinned. Truncate used to sit on
              this whole flex row, so a long name ellipsised the badge itself
              ("owne", "yo") instead of the name. */}
          <span className="min-w-0 truncate">{name}</span>
          {role === "owner" && (
            <Badge variant="accent" size="sm" className="shrink-0">
              owner
            </Badge>
          )}
          {role === "admin" && (
            <Badge variant="primary" size="sm" className="shrink-0">
              co-admin
            </Badge>
          )}
          {you && (
            <Badge variant="neutral" size="sm" className="shrink-0">
              you
            </Badge>
          )}
        </p>
        {status != null && (
          <div className="text-xs text-muted-foreground">{status}</div>
        )}
      </div>
      {trailing != null && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
