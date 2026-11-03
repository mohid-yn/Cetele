/**
 * Is this roadmap ready to publish, and who can see it right now?
 *
 * Client-only rules with no database twin (`set_roadmap_published` accepts an
 * empty roadmap), so `programme-readiness.test.ts` is their only check. Blockers
 * are things a member would hit as a broken promise. Notes are worth knowing but
 * are the organiser's call.
 */

export type ReadinessItem = {
  level: number;
  category: string;
  categoryLabel: string;
  unit: string;
  target: number;
};

export type ReadinessCheck = { id: string; message: string };

export type Readiness = {
  blockers: ReadinessCheck[];
  notes: ReadinessCheck[];
};

export function programmeReadiness({
  items,
  requirements,
  rewards,
  endsOn,
  todayISO,
  circles,
}: {
  items: ReadinessItem[];
  requirements: { level: number; category: string; minTotal: number }[];
  rewards: { threshold: number; label: string }[];
  endsOn: string;
  todayISO: string;
  circles: number;
}): Readiness {
  const blockers: ReadinessCheck[] = [];
  const notes: ReadinessCheck[] = [];

  if (items.length === 0) {
    blockers.push({ id: "no-items", message: "Add at least one item." });
  }

  // A total nobody can reach is a level nobody can finish, and neither the form
  // nor the database stops one being saved in this order.
  for (const req of requirements) {
    const group = items.filter(
      (i) => i.level === req.level && i.category === req.category,
    );
    if (group.length === 0) continue;
    const available = group.reduce((sum, i) => sum + i.target, 0);
    if (available < req.minTotal) {
      blockers.push({
        id: `budget-${req.level}-${req.category}`,
        message: `Level ${req.level} ${group[0].categoryLabel} asks for ${req.minTotal} ${group[0].unit}, but its items only add up to ${available}.`,
      });
    }
  }

  const levelCount = new Set(items.map((i) => i.level)).size;
  if (items.length > 0) {
    for (const reward of rewards) {
      if (reward.threshold > levelCount) {
        blockers.push({
          id: `reward-${reward.label}`,
          message: `“${reward.label}” needs ${reward.threshold} finished levels, but this roadmap has ${levelCount}.`,
        });
      }
    }
  }

  if (rewards.length === 0) {
    notes.push({ id: "no-rewards", message: "No rewards yet." });
  }
  if (todayISO > endsOn) {
    notes.push({
      id: "closed",
      message: "The closing date has already passed.",
    });
  }
  if (circles === 0) {
    notes.push({
      id: "no-circles",
      message: "No circles are on it yet, so nobody will see it until one is.",
    });
  }

  return { blockers, notes };
}

export type Reach =
  | { state: "draft"; circles: number; members: number }
  | { state: "unassigned"; circles: 0; members: 0 }
  | { state: "live"; circles: number; members: number };

/** The one sentence the admin screen leads with. */
export function programmeReach(
  published: boolean,
  following: { memberCount: number }[],
): Reach {
  const circles = following.length;
  const members = following.reduce((sum, c) => sum + c.memberCount, 0);
  if (!published) return { state: "draft", circles, members };
  if (circles === 0) return { state: "unassigned", circles: 0, members: 0 };
  return { state: "live", circles, members };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function reachSentence(reach: Reach): string {
  switch (reach.state) {
    case "draft":
      return reach.circles === 0
        ? "Only organisers can see this."
        : `Only organisers can see this. ${plural(reach.circles, "circle")} will get it when you publish.`;
    case "unassigned":
      return "Published, but no circle is on it yet, so no member can see it.";
    case "live":
      return `Live for ${plural(reach.members, "member")} in ${plural(reach.circles, "circle")}.`;
  }
}
