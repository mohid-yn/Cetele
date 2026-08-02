import * as React from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FlameIcon } from "./icons";

/**
 * The single, consistent streak treatment used across screens.
 *
 * SAGE, not rose. A streak is growth and continuity — the meaning sage already
 * owns in this system — and it is a STATE you are in, not an action you took.
 * The accent is rationed to one earned action or celebration per view (D25),
 * and this chip is permanently on Today and Progress, so on rose it spent the
 * whole budget before any real action could claim it. On the Members screen it
 * was one of three rose elements, none of which was an action, which is how an
 * accent stops reading as emphasis and starts reading as decoration.
 */
export function StreakChip({
  current,
  className,
}: {
  current: number;
  className?: string;
}) {
  return (
    <Badge
      variant="primary"
      size="md"
      className={cn("gap-1 px-3 py-1.5 text-sm", className)}
    >
      <FlameIcon className="size-4" />
      {current} day streak
    </Badge>
  );
}
