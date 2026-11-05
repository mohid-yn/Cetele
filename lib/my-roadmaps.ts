/** The viewer's memberships, with what each circle follows. */
export type MyCircle = {
  groups: { group_roadmaps: { roadmap_id: string }[] } | null;
};

/**
 * Does a circle of this viewer's follow the roadmap? Read from their own
 * memberships, because an organiser's RLS returns every circle's follows, so
 * "the roadmap has followers" would not mean "the viewer can log against it".
 */
export function followsRoadmap(
  memberships: readonly MyCircle[],
  roadmapId: string,
): boolean {
  return memberships.some((m) =>
    m.groups?.group_roadmaps.some((g) => g.roadmap_id === roadmapId),
  );
}
