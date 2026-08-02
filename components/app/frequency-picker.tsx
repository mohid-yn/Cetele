"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { MAX_FREQUENCY_DAYS, frequencyLabel } from "@/lib/goals";

/**
 * How often a task comes round (0021), as chips rather than a dropdown.
 *
 * Owner: "i dont like the dropdown ui for picking frequency of tasks make it
 * more intuitive and easier to configure less strain on operators."
 *
 * The old control was a native `<select>` over all fourteen values. On a phone
 * that is a tap, an OS wheel, a scroll and a confirm to say "weekly" — and the
 * fourteen values are not equally likely: daily, every other day, weekly and
 * fortnightly are what a circle actually picks, and "every 11 days" is noise
 * that made the list long enough to need scrolling in the first place.
 *
 * So the four real answers are one tap each, named in words rather than
 * arithmetic ("Weekly", not "Every 7 days"), and everything else lives behind
 * Custom. Nothing is removed: the full 1–14 range the database allows is still
 * reachable, because dropping it would take a capability away to fix an
 * ergonomics problem.
 *
 * It is also a real control now. The `<select>` was the last admin input still
 * outside the button system — the same "doesn't look like something you press"
 * family as the nav bar, and the reason `selectCls` had to hand-roll a focus
 * ring and a disabled token pair that `Button` already owns.
 */

/** The frequencies a circle actually reaches for, in the order they escalate. */
const PRESETS = [1, 2, 7, 14] as const;

export function FrequencyPicker({
  id,
  value,
  onChange,
  max = MAX_FREQUENCY_DAYS,
  label = "How often",
  disabled,
}: {
  id: string;
  value: number;
  onChange: (days: number) => void;
  /**
   * The loosest cycle on offer. The member's own picker passes the circle's
   * frequency, because a member may only ever go MORE often (D51 on the time
   * axis) — offering a looser option and then refusing it is the "nothing
   * happened" read that made the old goal control feel broken.
   */
  max?: number;
  label?: string;
  disabled?: boolean;
}) {
  const presets = PRESETS.filter((d) => d <= max);
  const rest = Array.from({ length: max }, (_, i) => i + 1).filter(
    (d) => !presets.includes(d as (typeof PRESETS)[number]),
  );

  const valueIsCustom = !presets.includes(value as (typeof PRESETS)[number]);
  // Open when the current value only exists behind Custom, so the picker always
  // shows what is actually selected rather than an unexplained "Custom" chip.
  const [showCustom, setShowCustom] = React.useState(valueIsCustom);

  // A task whose circle is already daily has nothing to offer behind Custom —
  // render the presets alone rather than a control that opens onto nothing.
  const hasCustom = rest.length > 0;

  return (
    <div>
      <p id={`${id}-label`} className="mb-2 text-sm text-muted-foreground">
        {label}
      </p>
      {/* gap-3 (12px) is load-bearing, not taste: `size="sm"` is 36px painted
          with `tap-area-44` expanding it 4px above and below, so a wrapped row
          at gap-2 would have adjacent rows' hit areas meeting exactly. */}
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex flex-wrap gap-3"
      >
        {presets.map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            disabled={disabled}
            variant={value === d ? "primary" : "outline"}
            aria-pressed={value === d}
            onClick={() => {
              onChange(d);
              setShowCustom(false);
            }}
          >
            {frequencyLabel(d)}
          </Button>
        ))}

        {hasCustom && (
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            variant={valueIsCustom ? "primary" : "outline"}
            aria-expanded={showCustom}
            aria-controls={`${id}-custom`}
            // The VISIBLE label becomes the chosen value, but the accessible
            // name must not: the grid below has a chip whose own name is that
            // same value, so both would announce "Every 5 days" while meaning
            // different things — one opens a list, the other picks a number.
            aria-label={
              valueIsCustom
                ? `Custom, currently ${frequencyLabel(value)}`
                : "Custom"
            }
            onClick={() => setShowCustom((v) => !v)}
          >
            {/* The chip carries the value when one is chosen, so a custom
                setting is readable without opening the row. */}
            {valueIsCustom ? frequencyLabel(value) : "Custom"}
          </Button>
        )}
      </div>

      {hasCustom && showCustom && (
        <div
          id={`${id}-custom`}
          role="group"
          aria-label="Every N days"
          className="mt-3 flex flex-wrap gap-3"
        >
          {rest.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              disabled={disabled}
              variant={value === d ? "primary" : "outline"}
              aria-pressed={value === d}
              // The number alone is the visible label — a grid of "Every 3
              // days" chips is unreadable — so the accessible name carries the
              // full phrase. A bare "3" announces nothing.
              aria-label={frequencyLabel(d)}
              onClick={() => onChange(d)}
              className="tabular-nums"
            >
              {d}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
