import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The one emphasis surface per screen (Progress' streak block, the Today
 * banners). Deep emerald gradient + a sheen layer, so the screen has a single
 * clear focal point rather than a row of equal-weight cards.
 *
 * Text colour is `--gradient-hero-foreground`, NOT `text-primary-foreground`:
 * on dark, `--primary` is the light emerald, so `--primary-foreground` is
 * near-black and would vanish against these deep stops. The dedicated token is
 * ≥5.48:1 against every stop in both themes. See DESIGN_SYSTEM.md §Depth.
 *
 * The gradient carries the emphasis on its own — this is not a gold surface.
 * Gold stays scarce (D25): if a hero needs an action, that action can be the
 * screen's one accent, but the hero itself never is.
 */
export interface HeroCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Small icon tile, top-left — a flame, a ring, a crescent. */
  medallion?: React.ReactNode;
  /** The eyebrow above the stat. */
  label?: React.ReactNode;
  /** The headline value. */
  stat?: React.ReactNode;
  /** Supporting line under the stat. */
  caption?: React.ReactNode;
  /** Right-hand slot — a chip, a badge, a secondary stat. */
  trailing?: React.ReactNode;
}

export function HeroCard({
  medallion,
  label,
  stat,
  caption,
  trailing,
  className,
  children,
  ...props
}: HeroCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl p-6 shadow-lg",
        className,
      )}
      style={{
        backgroundImage: "var(--gradient-hero)",
        color: "var(--gradient-hero-foreground)",
      }}
      {...props}
    >
      {/* The sheen is its own layer so the gradient stays a single stop list. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--gradient-hero-sheen)" }}
      />

      <div className="relative flex items-start gap-4">
        {medallion != null && (
          <div
            className="grid size-14 shrink-0 place-items-center rounded-2xl"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--gradient-hero-foreground) 12%, transparent)",
            }}
          >
            {medallion}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {label != null && (
            <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
              {label}
            </p>
          )}
          {stat != null && (
            <p className="font-display text-4xl font-bold tabular-nums">
              {stat}
            </p>
          )}
          {caption != null && (
            <p className="mt-1 text-sm opacity-90">{caption}</p>
          )}
        </div>

        {trailing != null && <div className="shrink-0">{trailing}</div>}
      </div>

      {children != null && <div className="relative mt-4">{children}</div>}
    </div>
  );
}

/**
 * A chip for use INSIDE HeroCard — typically the `trailing` slot.
 *
 * Do not reach for `<Badge variant="outline">` here: it sets `text-foreground`,
 * which is the near-black `#1c1814` in light theme and lands at ~1.7:1 on the
 * emerald gradient. It reads as fine at a glance, which is exactly why it is
 * worth stating. This chip draws from `currentColor` instead, so it inherits
 * `--gradient-hero-foreground` and keeps the hero's measured contrast.
 */
export function HeroChip({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        className,
      )}
      style={{
        borderColor: "color-mix(in oklab, currentColor 35%, transparent)",
        backgroundColor: "color-mix(in oklab, currentColor 12%, transparent)",
      }}
      {...props}
    />
  );
}
