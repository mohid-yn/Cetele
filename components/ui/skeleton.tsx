import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A pulsing placeholder block for route `loading.tsx` shells — so a server-first
 * navigation paints its layout instantly and the real data streams in, instead
 * of the tab appearing to hang on the DB round-trip. Token-based (uses `--muted`
 * via `bg-muted`); size/shape via `className`.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
