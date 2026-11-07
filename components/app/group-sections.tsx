"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Segmented } from "./segmented";
import { groupHref } from "@/lib/group-href";

/**
 * The Group tab's sections (D83). Progress used to be a tab on the bar; it moved
 * here to make room for Events, so the bar stays at five with a roadmap.
 *
 * Overview, Standings and Members switch in place on the Group screen. Progress
 * is its own route (`/g/[id]/progress`, server-rendered from the member's logs),
 * so choosing it navigates, and choosing another section from Progress goes back
 * to Group with `?tab=`. The control looks and sits the same on both screens,
 * so it reads as one set of tabs.
 */
export type GroupSection = "overview" | "standings" | "members" | "progress";

export const GROUP_SECTIONS: { value: GroupSection; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "standings", label: "Standings" },
  { value: "members", label: "Members" },
  { value: "progress", label: "Progress" },
];

export function isGroupSection(v: unknown): v is GroupSection {
  return GROUP_SECTIONS.some((s) => s.value === v);
}

export function GroupSections({
  groupId,
  value,
  onInPage,
}: {
  groupId: string;
  value: GroupSection;
  /** On the Group screen: switch in place. Absent on Progress: always navigate. */
  onInPage?: (v: Exclude<GroupSection, "progress">) => void;
}) {
  const router = useRouter();
  const progressHref = groupHref(groupId, "/progress");
  const groupBase = groupHref(groupId, "/group");

  React.useEffect(() => {
    router.prefetch(value === "progress" ? groupBase : progressHref);
  }, [router, value, groupBase, progressHref]);

  return (
    <Segmented<GroupSection>
      value={value}
      options={GROUP_SECTIONS}
      onChange={(next) => {
        if (next === value) return;
        if (next === "progress") router.push(progressHref);
        else if (onInPage) onInPage(next);
        else router.push(`${groupBase}?tab=${next}`);
      }}
    />
  );
}
