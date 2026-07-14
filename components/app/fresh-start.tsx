"use client";

/**
 * Fresh-start re-engagement (CET-19).
 *
 * The fresh-start effect: people are most open to restarting a habit at a
 * temporal landmark — a new week, the 1st of the month, or a comeback after a
 * lapse. Almost nobody does this well, and it's cheap. The banner is calm and
 * framed as opportunity — never guilt (D8).
 *
 * The landmark is detected server-side (`detectLandmark`). Dismissing writes a
 * row keyed to THIS OCCURRENCE (`week:2026-W29`), so it stays gone across
 * devices and navigations — the mock dismissed into React state, so it came
 * straight back on the next render — while next week's landmark still fires.
 */

import * as React from "react";
import Link from "next/link";
import { Card, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Landmark } from "@/lib/retention";
import { dismissBanner } from "@/app/(app)/g/[groupId]/today/actions";
import { SproutIcon } from "@/components/app/icons";

export function FreshStartBanner({
  landmark,
  beginHref,
}: {
  landmark: Landmark;
  beginHref: string | null;
}) {
  const [gone, setGone] = React.useState(false);
  const [, startTransition] = React.useTransition();

  if (gone) return null;

  const close = () => {
    setGone(true); // optimistic: it never flashes back
    startTransition(() => {
      void dismissBanner(landmark.key);
    });
  };

  return (
    <Card className="relative border-primary-500/30 bg-primary-500/10 p-4">
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
            {landmark.title}
          </p>
          <p className="mt-0.5 text-sm text-balance text-muted-foreground">
            {landmark.body}
          </p>
          {beginHref && (
            <Link
              href={beginHref}
              onClick={close}
              className={cn(
                buttonVariants({ variant: "primary", size: "sm" }),
                "mt-3",
              )}
            >
              Begin today
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
