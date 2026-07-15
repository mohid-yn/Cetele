import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Brand marks. The mark itself lives in `public/logo.svg` (a fixed green + gold
 * logo) and is referenced here rather than inlined — it carries its own colours
 * (so it isn't theme-token-driven), and keeping it a static asset avoids raw hex
 * in TSX (the token-contract ESLint rule) and gradient-id collisions when the
 * mark appears more than once on a page.
 *
 * - AppIconLogo — the square app icon (mark on a light tile); hero mark (login,
 *   splash). Corner-rounding/shadow come from the caller's className.
 * - WebAppLogo — horizontal icon + "Cetele" wordmark; use in headers/navbars.
 */

export function AppIconLogo({ className = "size-24" }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid place-items-center overflow-hidden bg-white",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/logo.svg" alt="Cetele" className="size-[82%]" />
    </span>
  );
}

export function WebAppLogo({
  className = "h-10 w-auto",
}: {
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-foreground",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img src="/logo.svg" alt="" aria-hidden className="h-full w-auto" />
      <span className="font-display text-[1.4em] leading-none font-bold tracking-tight">
        Cetele
      </span>
    </span>
  );
}
