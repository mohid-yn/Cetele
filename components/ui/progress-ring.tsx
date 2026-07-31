import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current value. */
  value: number;
  /** Target value the ring fills toward. */
  max?: number;
  /** Outer diameter in px. */
  size?: number;
  /** Stroke width in px. */
  thickness?: number;
  /** Track + progress colors (any CSS color). Defaults: the sand track token,
   *  emerald fill. Override only for a genuinely different surface — a track
   *  thinned with alpha reads as no track at all. */
  trackColor?: string;
  progressColor?: string;
  /**
   * Fill the parent box instead of locking the rendered box to `size` px.
   * `size` still defines the ring's GEOMETRY (viewBox units), so `thickness`
   * stays proportional as the box scales.
   *
   * Needed because `size` is applied as an INLINE width/height, which no
   * className can override — a caller that sized the ring with `h-full w-full`
   * silently got `size` px anyway. See the note on the wrapper below.
   */
  fluid?: boolean;
  /**
   * Draw a hairline notch across the stroke at this value — "the point on this
   * ring that means something else". Used for a personal stretch goal (D51),
   * where `max` is the member's own bar and the notch is the circle's share:
   * without it a raised goal would hide the only threshold that actually feeds
   * the streak. Omit (the default) and the ring is unchanged.
   */
  mark?: number;
  /** Render content in the center (e.g. count, percent, icon). */
  children?: React.ReactNode;
}

/**
 * Accessible circular progress indicator. The visual heart of Cetele — a
 * dhikr item's ring that fills as the count climbs and "closes" on completion.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 96,
  thickness = 10,
  trackColor = "var(--progress-track)",
  progressColor = "var(--primary)",
  fluid = false,
  mark,
  className,
  children,
  ...props
}: ProgressRingProps) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - pct);
  const complete = pct >= 1;

  // The notch: a radial hairline cutting the full stroke width. Positioned in
  // the svg's own coordinates (0 = 3 o'clock), which the wrapper's -rotate-90
  // then carries to 12 o'clock like the arc. Drawn in `--foreground` rather
  // than as a gap in the ring, because it has to read against BOTH the emerald
  // fill and the sand track wherever the ring sits — a gap would have to know
  // the page behind it, and this ring sits on the card on Today and on the
  // page background on the count screen. Suppressed at the ends, where it
  // would only blunt the arc's own start/finish.
  const markPct = mark != null && max > 0 ? mark / max : null;
  const markAngle =
    markPct != null && markPct > 0 && markPct < 1
      ? 2 * Math.PI * markPct
      : null;

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        // `shrink-0`: a ring is a circle at a chosen diameter, never a thing a
        // flex parent may squash. The Group hero sat in `flex items-center
        // gap-5` and was shrunk 112 → 103.4px wide while staying 112 tall, so
        // the viewBox scaled to fit the SHORT side and drew the circle at
        // 92.3px — 8% under spec, in a non-square box. (2026-07-24)
        "relative inline-grid shrink-0 place-items-center",
        fluid && "h-full w-full",
        className,
      )}
      // Locked to `size` px unless `fluid`. This is an INLINE style, so it beats
      // any width/height utility a caller passes in `className` — hence the
      // explicit prop rather than letting callers "just add h-full w-full",
      // which loses silently. (2026-07-24)
      style={fluid ? undefined : { width: size, height: size }}
      {...props}
    >
      {/* viewBox, not width/height: the ring's GEOMETRY stays in `size` units
          while its rendered box follows the wrapper, so `fluid` can scale it
          (e.g. to viewport height on a short phone) with CSS alone. */}
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={complete ? "var(--success)" : progressColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          style={{
            transition:
              "stroke-dashoffset var(--duration-slow) var(--ease-brand), stroke var(--duration-base)",
          }}
        />
        {markAngle != null && (
          <line
            aria-hidden
            x1={size / 2 + (radius - thickness / 2) * Math.cos(markAngle)}
            y1={size / 2 + (radius - thickness / 2) * Math.sin(markAngle)}
            x2={size / 2 + (radius + thickness / 2) * Math.cos(markAngle)}
            y2={size / 2 + (radius + thickness / 2) * Math.sin(markAngle)}
            // A token referenced INLINE, with a fallback — a colour that must
            // always render never rides on a stylesheet rule reaching the page,
            // and SVG's initial stroke is black. (§4, the garden's black sky.)
            // `--progress-mark` is per-theme and INVERTS between them: it was
            // `--foreground` until that measured 2.10:1 on the dark fill. The
            // fallback is a token, then `currentColor` — a hex here is an
            // ESLint error under the token contract.
            stroke="var(--progress-mark, var(--foreground, currentColor))"
            strokeWidth={Math.max(1.5, size / 90)}
            strokeLinecap="butt"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}
