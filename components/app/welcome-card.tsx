/**
 * Endowed-progress onboarding (CET-21).
 *
 * The research lever is real — starting visibly part-way beats starting at zero
 * (the loyalty card stamped 2/10 beats the blank one at 0/8). The honest version
 * of it endows a new member with their CIRCLE's genuine momentum, not with dhikr
 * they never performed: this is a worship tracker, and D43 forbids writing a
 * count on someone's behalf to manufacture a feeling.
 *
 * So day one opens with a true statement — the circle really is part-way toward
 * today's goal, and joining really did make them part of it. Retires itself on
 * their first logged count.
 */

import Link from "next/link";
import { Card, ProgressBar, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SproutIcon } from "@/components/app/icons";

export function WelcomeCard({
  groupName,
  collectivePct,
  beginHref,
}: {
  groupName: string;
  collectivePct: number;
  beginHref: string | null;
}) {
  return (
    <Card className="border-primary-500/30 bg-primary-500/10 p-4">
      {/* The medallion is FreshStartBanner's exactly (same size, ramp steps and
          radius). These two banners share the Today screen and the same Card
          treatment, so the leaf that used to sit at the end of this line as an
          emoji becomes the thing that makes them read as one family — and it
          takes its colour from a token instead of the OS's emoji font. */}
      <p className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
          <SproutIcon aria-hidden className="size-4" />
        </span>
        Welcome to {groupName}
      </p>

      {collectivePct > 0 ? (
        <>
          {/* Deliberately NOT "your circle is X% toward today's goal" — Today
              already says exactly that below the rings, and a newcomer meeting
              the same sentence twice on one screen reads as a bug, not a
              welcome. This frames the same truth for THEM: you arrived mid-flow. */}
          <p className="mt-0.5 text-sm text-balance text-muted-foreground">
            You&apos;re not starting from zero — the circle has already covered{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {collectivePct}%
            </span>{" "}
            of today together, and you&apos;re part of it now.
          </p>
          <ProgressBar
            value={collectivePct}
            className="mt-3"
            role="img"
            aria-label={`The circle is ${collectivePct}% toward today's goal`}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Close your first ring to add to it.
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-sm text-balance text-muted-foreground">
          The circle&apos;s day is just beginning — close the first ring and set
          the pace for everyone.
        </p>
      )}

      {beginHref && (
        <Link
          href={beginHref}
          className={cn(
            buttonVariants({ variant: "primary", size: "sm" }),
            "mt-3",
          )}
        >
          Begin today
        </Link>
      )}
    </Card>
  );
}
