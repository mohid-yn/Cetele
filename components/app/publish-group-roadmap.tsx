"use client";

import * as React from "react";
import { setGroupRoadmap } from "@/lib/use-group-roadmap";

/**
 * Tells the nav whether this circle follows a programme (D55/Q7).
 *
 * The same shape as `RememberActiveGroup` next to it, and for the same reason:
 * the fact is known by a server component INSIDE the tree the nav wraps, and
 * there is no way to hand it upward. A mount effect publishes it to a module
 * store the nav subscribes to.
 *
 * On MOUNT, not during render: writing to an external store while rendering is
 * a side effect in render, and it would tear under concurrent rendering — the
 * nav could read a value for a navigation that never commits. Keyed on
 * `groupId` so switching circles republishes.
 */
export function PublishGroupRoadmap({
  groupId,
  hasRoadmap,
}: {
  groupId: string;
  hasRoadmap: boolean;
}) {
  React.useEffect(() => {
    setGroupRoadmap(groupId, hasRoadmap);
  }, [groupId, hasRoadmap]);
  return null;
}
