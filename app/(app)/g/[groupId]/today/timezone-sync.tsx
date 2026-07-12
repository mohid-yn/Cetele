"use client";

import * as React from "react";
import { setTimezone } from "./actions";

/**
 * D34: profiles.timezone is auto-detected from the browser (editable later in
 * Profile). Fire-and-forget — runs once per mount, only when it differs.
 */
export function TimezoneSync({
  groupId,
  current,
}: {
  groupId: string;
  current: string;
}) {
  React.useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && detected !== current) void setTimezone(groupId, detected);
  }, [groupId, current]);
  return null;
}
