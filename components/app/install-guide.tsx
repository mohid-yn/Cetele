"use client";

/**
 * How to install Cetele, for the one case where it is load-bearing rather than
 * a nicety: iOS delivers Web Push only to an app installed on the Home Screen,
 * so on iPhone the install IS the reminder setup. Shown in place of the push
 * toggle, never alongside it — a member should see the step they can actually
 * take, not a dead control plus an explanation of why it is dead.
 *
 * Steps are numbered because they are a sequence to follow, not a feature list
 * (the eyebrow/step-number ban in the design guidelines is about decoration).
 */

import { Card } from "@/components/ui";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-800 tabular-nums"
      >
        {n}
      </span>
      <span className="text-xs leading-5 text-muted-foreground">
        {children}
      </span>
    </li>
  );
}

export function IosInstallGuide() {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground">
        Add Cetele to your Home Screen first
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        On iPhone and iPad, reminders can only reach an installed app — Apple
        does not deliver them to a Safari tab. It takes about ten seconds.
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        <Step n={1}>
          Open Cetele in <strong className="text-foreground">Safari</strong>{" "}
          (Chrome and Firefox on iPhone cannot install it).
        </Step>
        <Step n={2}>
          Tap the <strong className="text-foreground">Share</strong> button —
          the square with an arrow pointing up, in the toolbar.
        </Step>
        <Step n={3}>
          Scroll down and tap{" "}
          <strong className="text-foreground">Add to Home Screen</strong>, then{" "}
          <strong className="text-foreground">Add</strong>.
        </Step>
        <Step n={4}>
          Open Cetele from the new Home Screen icon and come back here — the
          reminder switch will be waiting.
        </Step>
      </ol>
      <p className="mt-3 text-[11px] text-muted-foreground/80">
        Needs iOS 16.4 or later. Your streak, counts and circles are already
        saved to your account, so nothing is lost in the move.
      </p>
    </Card>
  );
}

/**
 * Everywhere else. Android and desktop browsers deliver push to a plain tab, so
 * reaching this means the browser has no Web Push at all — installing will not
 * change that, and saying otherwise would be the same lie in a new place. The
 * honest move is naming a browser that works.
 */
export function UnsupportedBrowserNote() {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground">
        This browser can&apos;t receive reminders
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reminders need Web Push, which this browser doesn&apos;t support.
        Chrome, Edge or Firefox — on Android or desktop — will work, as will an
        iPhone with Cetele added to the Home Screen. Times you set below are
        saved to your account, so they will start arriving once a device that
        can receive them is turned on.
      </p>
    </Card>
  );
}

/** Our own VAPID key is missing, so no device could be sent anything. */
export function PushUnconfiguredNote() {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-foreground">
        Reminders are temporarily unavailable
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This one is on us, not your device — reminder delivery isn&apos;t
        configured on the server. Times you set below are still saved.
      </p>
    </Card>
  );
}
