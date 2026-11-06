"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { CheckIcon } from "@/components/app/icons";
import { cn } from "@/lib/utils";
import { setRsvp } from "@/app/(app)/events/actions";
import { hapticTick } from "@/lib/haptics";
import { usePropState } from "@/lib/use-prop-state";
import { forgetUpcoming } from "@/lib/upcoming-cache";
import type { RsvpStatus } from "@/lib/events";

const CHOICES: { value: RsvpStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't" },
];

/**
 * One tap answers (D80). The same control on Today's card, the events list and
 * the event's own screen, so the gesture is learnt once.
 *
 * OPTIMISTIC, reconciled from the action's own return (§4): the new answer
 * shows the instant it is tapped, and a refusal ("this event is full",
 * "replies have closed") puts the old one back and says why. Tapping the
 * current answer again takes it back.
 *
 * `onChange` lets a parent keep its counts in step without a refetch.
 */
export function RsvpButtons({
  eventId,
  value,
  onChange,
  disabled,
  full,
  size = "sm",
  className,
}: {
  eventId: string;
  value: RsvpStatus | null;
  onChange?: (next: RsvpStatus | null, prev: RsvpStatus | null) => void;
  disabled?: boolean;
  /** At capacity: "Going" is offered only to someone already going. */
  full?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [current, setCurrent] = usePropState<RsvpStatus | null>(value);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const choose = async (choice: RsvpStatus) => {
    const prev = current;
    const next = prev === choice ? null : choice;
    setError(null);
    setCurrent(next);
    onChange?.(next, prev);
    hapticTick();
    setPending(true);
    try {
      const res = await setRsvp(eventId, next);
      forgetUpcoming();
      if (res.error) {
        setCurrent(prev);
        onChange?.(prev, next);
        setError(res.error);
      }
    } catch {
      setCurrent(prev);
      onChange?.(prev, next);
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={className}>
      <div
        role="group"
        aria-label="Your answer"
        className="grid grid-cols-3 gap-1.5"
      >
        {CHOICES.map((c) => {
          const on = current === c.value;
          const blocked = c.value === "going" && full && current !== "going";
          return (
            <Button
              key={c.value}
              type="button"
              size={size}
              variant={
                on ? (c.value === "going" ? "primary" : "tonal") : "outline"
              }
              aria-pressed={on}
              disabled={disabled || blocked || pending}
              onClick={() => void choose(c.value)}
              className={cn("w-full", on && "font-semibold")}
            >
              {on && c.value === "going" && (
                <CheckIcon aria-hidden className="size-4" />
              )}
              {blocked ? "Full" : c.label}
            </Button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
