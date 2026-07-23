import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The small uppercase section label. Hand-written in several places at slightly
 * different weights, which read as drift rather than intent — extracted so every
 * section label in the app is the same object.
 *
 * Renders a <p> by default; pass `as="span"` where the surrounding markup needs
 * a phrasing element (inside a heading row, a legend, a button).
 */
export interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "h2" | "h3";
}

export function Eyebrow({ as = "p", className, ...props }: EyebrowProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "text-xs font-semibold tracking-wide text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  );
}
