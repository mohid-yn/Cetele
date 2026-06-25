import * as React from "react";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/mock/types";

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
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          {name}
          {role === "group_admin" && (
            <Badge variant="primary" size="sm">
              admin
            </Badge>
          )}
          {you && (
            <Badge variant="neutral" size="sm">
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
