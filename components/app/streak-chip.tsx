import * as React from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FlameIcon } from "./icons";

/** The single, consistent streak treatment used across screens. */
export function StreakChip({
  current,
  className,
}: {
  current: number;
  className?: string;
}) {
  return (
    <Badge
      variant="accent"
      size="md"
      className={cn("gap-1 px-3 py-1.5 text-sm", className)}
    >
      <FlameIcon className="size-4" />
      {current} day streak
    </Badge>
  );
}
