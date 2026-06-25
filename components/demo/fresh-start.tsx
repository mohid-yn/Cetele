"use client";

/**
 * Fresh-start re-engagement (CET-19).
 *
 * The fresh-start effect: people are most open to restarting a habit at a
 * temporal landmark — a new week, the 1st of the month, a Hijri new month,
 * Ramadan. Almost nobody does this well, and it's cheap. We surface a calm,
 * clean-slate banner at those moments (and on a comeback after a lapse), framed
 * as opportunity — never guilt (D8).
 *
 * Mock: the landmark is derived from today's date; the Demo Controls "Fresh
 * start" button forces it on for a walkthrough. A real build would also fire
 * from the Hijri calendar and a lapsed-member trigger via push/email.
 */

import * as React from "react";
import Link from "next/link";
import { Card, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMock, sel } from "@/lib/mock/store";
import { SproutIcon } from "./icons";

type Landmark = "week" | "month" | "comeback";

function detectLandmark(): Landmark | null {
  const d = new Date();
  if (d.getDate() <= 1) return "month";
  if (d.getDay() === 1) return "week"; // Monday
  return null;
}

const COPY: Record<Landmark, { title: string; body: string }> = {
  month: {
    title: "A new month, a clean slate",
    body: "Fresh start. Pick one task and begin the chain again today — your circle is right here with you.",
  },
  week: {
    title: "New week, fresh start",
    body: "However last week went, today resets the rhythm. Close one ring and you're moving again.",
  },
  comeback: {
    title: "Welcome back — pick up where you left off",
    body: "Every day is a fresh start. Your circle saved your spot; one task today is all it takes to begin again.",
  },
};

export function FreshStartBanner() {
  const { state, actions } = useMock();
  const [dismissed, setDismissed] = React.useState(false);

  const forced = state.ui.freshStart;
  const landmark: Landmark | null = forced
    ? (detectLandmark() ?? "comeback")
    : detectLandmark();

  // A forced (demo) banner always shows — re-triggering ignores a past dismiss;
  // a natural-landmark banner respects the local dismiss.
  const visible = !!landmark && (forced || !dismissed);
  if (!visible || !landmark) return null;
  const { title, body } = COPY[landmark];

  const close = () => {
    setDismissed(true);
    if (forced) actions.setFreshStart(false);
  };

  return (
    <Card className="relative border-primary-200 bg-primary-50 p-4">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={close}
        className="absolute top-2.5 right-3 text-lg leading-none text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
          <SproutIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <p className="font-display text-base font-semibold text-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-sm text-balance text-muted-foreground">
            {body}
          </p>
          <Link
            href={`/count/${sel.groupTasks(state, state.session.activeGroupId)[0]?.id ?? ""}`}
            onClick={close}
            className={cn(
              buttonVariants({ variant: "primary", size: "sm" }),
              "mt-3",
            )}
          >
            Begin today
          </Link>
        </div>
      </div>
    </Card>
  );
}
