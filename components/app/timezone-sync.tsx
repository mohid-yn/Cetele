"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setTimezone } from "@/app/(app)/groups/actions";
import { localDateISO } from "@/lib/local-date";

/**
 * The FALLBACK half of D34/D44 timezone detection.
 *
 * The primary path is sign-in: the browser stashes its zone in a cookie and the
 * auth callback writes it onto the profile before the first authenticated render
 * (lib/timezone.ts). So by the time this mounts, the zone is normally already
 * right and this is a no-op.
 *
 * It exists for the cases that path can't cover: a member who signed in before
 * that existed, or one who has since travelled. Mounted in the app SHELL rather
 * than a page, because a member can enter on any screen — an invite link drops
 * them straight onto /today.
 *
 * It refreshes ONLY when the day boundary actually moved. router.refresh()
 * re-renders the whole tree, which resets an open dialog under the user (it
 * really did wipe the half-typed "New group" name), so it is not something to
 * fire on a cosmetic zone change — only when the dates on screen are wrong.
 */
export function TimezoneSync({ current }: { current: string }) {
  const router = useRouter();

  React.useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || detected === current) return;

    void (async () => {
      const { error } = await setTimezone(detected);
      if (error) return;
      // Same instant, two zones: if they name the same calendar day, nothing on
      // screen is wrong and a disruptive refresh would buy nothing.
      if (localDateISO(detected) !== localDateISO(current)) router.refresh();
    })();
  }, [current, router]);

  return null;
}
