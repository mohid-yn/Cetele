/**
 * Which circle should "Log my progress" open for this viewer and roadmap?
 *
 * The member's roadmap screen is the only place progress is recorded, and it
 * lives under a circle. Progress is keyed on the member and the item (D55), so
 * any following circle reaches the same record, and the choice only decides
 * which circle the viewer lands in. The one they are already in wins, so the
 * link does not move them if it does not have to.
 */
export type MyCircle = {
  group_id: string;
  groups: {
    name: string;
    group_roadmaps: { roadmap_id: string }[];
  } | null;
};

export function myProgressCircle(
  memberships: readonly MyCircle[],
  roadmapId: string,
  activeGroupId: string | null,
): { groupId: string; name: string } | null {
  const following = memberships.filter((m) =>
    m.groups?.group_roadmaps.some((g) => g.roadmap_id === roadmapId),
  );
  const chosen =
    following.find((m) => m.group_id === activeGroupId) ?? following[0];
  return chosen?.groups
    ? { groupId: chosen.group_id, name: chosen.groups.name }
    : null;
}
