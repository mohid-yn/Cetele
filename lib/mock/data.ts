/**
 * Seed data for the clickable prototype (CET-14).
 *
 * Content is realistic dhikr (the flagship audience) — but the *model* is the
 * generic `Task` (D17). Everything is dated relative to "today" at load time so
 * the demo always opens mid-day with partial progress to tap toward.
 */

import type { MockState, Log } from "./types";

/** Local ISO date (YYYY-MM-DD) for `daysAgo` days before today. */
export function isoDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Tiny deterministic PRNG so the seeded week looks the same every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STORAGE_VERSION = 3;
export const STORAGE_KEY = `cetele-mock-v${STORAGE_VERSION}`;

let logSeq = 0;
const log = (
  userId: string,
  taskId: string,
  date: string,
  count: number,
): Log => ({
  id: `l-${++logSeq}`,
  userId,
  taskId,
  date,
  count,
});

export function createInitialState(): MockState {
  logSeq = 0;
  const rand = mulberry32(42);

  // ---- People ---------------------------------------------------------------
  // u-1 is the logged-in persona: group_admin of Fajr Circle AND app admin,
  // so the demo's role switcher can reach all three views as one user.
  const users: MockState["users"] = [
    { id: "u-1", name: "Ahmad Hassan", isAdmin: true },
    { id: "u-2", name: "Yusuf Demir", isAdmin: false },
    { id: "u-3", name: "Aisha Rahman", isAdmin: false },
    { id: "u-4", name: "Bilal Osman", isAdmin: false },
    { id: "u-5", name: "Fatima Noor", isAdmin: false },
    { id: "u-6", name: "Omar Farooq", isAdmin: false },
    { id: "u-7", name: "Zayd Malik", isAdmin: false },
    { id: "u-8", name: "Layla Aziz", isAdmin: false },
  ];

  // ---- Groups ---------------------------------------------------------------
  const groups: MockState["groups"] = [
    {
      id: "g-1",
      name: "Fajr Circle",
      inviteCode: "FAJR-7K2",
      createdBy: "u-1",
    },
    {
      id: "g-2",
      name: "Maghrib Circle",
      inviteCode: "MGRB-9X4",
      createdBy: "u-7",
    },
  ];

  const memberships: MockState["memberships"] = [
    { userId: "u-1", groupId: "g-1", role: "group_admin" },
    { userId: "u-2", groupId: "g-1", role: "member" },
    { userId: "u-3", groupId: "g-1", role: "member" },
    { userId: "u-4", groupId: "g-1", role: "member" },
    { userId: "u-5", groupId: "g-1", role: "member" },
    { userId: "u-6", groupId: "g-1", role: "member" },
    // u-1 also runs Maghrib Circle → demonstrates a group admin of *multiple*
    // groups (the group switcher lets them manage each).
    { userId: "u-1", groupId: "g-2", role: "group_admin" },
    { userId: "u-7", groupId: "g-2", role: "group_admin" },
    { userId: "u-8", groupId: "g-2", role: "member" },
  ];

  // ---- Tasks (generic model, dhikr content) --------------------------------
  const tasks: MockState["tasks"] = [
    {
      id: "t-1",
      groupId: "g-1",
      label: "SubhanAllah",
      subtitle: "سُبْحَانَ الله",
      targetCount: 100,
      sortOrder: 0,
    },
    {
      id: "t-2",
      groupId: "g-1",
      label: "Alhamdulillah",
      subtitle: "الْحَمْدُ لله",
      targetCount: 100,
      sortOrder: 1,
    },
    {
      id: "t-3",
      groupId: "g-1",
      label: "Allahu Akbar",
      subtitle: "اللهُ أَكْبَر",
      targetCount: 100,
      sortOrder: 2,
    },
    {
      id: "t-4",
      groupId: "g-1",
      label: "Astaghfirullah",
      subtitle: "أَسْتَغْفِرُ الله",
      targetCount: 1000,
      sortOrder: 3,
    },
    {
      id: "t-5",
      groupId: "g-1",
      label: "Salawat",
      subtitle: "اللّٰهُمَّ صَلِّ عَلَى مُحَمَّد",
      targetCount: 100,
      sortOrder: 4,
    },
    {
      id: "t-6",
      groupId: "g-2",
      label: "La ilaha illallah",
      subtitle: "لَا إِلٰهَ إِلَّا الله",
      targetCount: 100,
      sortOrder: 0,
    },
    {
      id: "t-7",
      groupId: "g-2",
      label: "Astaghfirullah",
      subtitle: "أَسْتَغْفِرُ الله",
      targetCount: 500,
      sortOrder: 1,
    },
  ];

  // ---- Logs -----------------------------------------------------------------
  const today = isoDate(0);
  const fajrTasks = tasks.filter((t) => t.groupId === "g-1");
  const logs: Log[] = [];

  // Today, the logged-in user: mostly mid-progress, with t-5 *almost* done so
  // the demo has a satisfying "one tap to close the ring → confetti" moment.
  logs.push(log("u-1", "t-1", today, 100)); // already complete (closed ring)
  logs.push(log("u-1", "t-2", today, 64));
  logs.push(log("u-1", "t-3", today, 30));
  logs.push(log("u-1", "t-4", today, 240));
  logs.push(log("u-1", "t-5", today, 96)); // 4 taps from completion

  // Today, the peers: varied partial progress so the live counter looks alive.
  for (const u of ["u-2", "u-3", "u-4", "u-5", "u-6"]) {
    for (const t of fajrTasks) {
      const frac = 0.2 + rand() * 0.8;
      logs.push(log(u, t.id, today, Math.round(t.targetCount * frac)));
    }
  }

  // Past ~90 days of history per Fajr member, with a distinct per-member
  // "diligence" so the consistency tracker (CET-16) shows real variation —
  // some members near-perfect, some patchy. `active` = chance they showed up
  // that day; `quality` = chance a given task got fully closed when they did.
  // Deterministic via the PRNG so every load looks the same.
  const HISTORY_DAYS = 90;
  const profile: Record<string, { active: number; quality: number }> = {
    "u-1": { active: 0.86, quality: 0.8 }, // Ahmad — solid (streak 12 / best 21)
    "u-2": { active: 0.72, quality: 0.7 }, // Yusuf — good but skips
    "u-3": { active: 0.95, quality: 0.92 }, // Aisha — near-perfect (streak 23)
    "u-4": { active: 0.6, quality: 0.65 }, // Bilal — patchy
    "u-5": { active: 0.97, quality: 0.95 }, // Fatima — the steadfast one (31)
    "u-6": { active: 0.45, quality: 0.6 }, // Omar — fell off lately (streak 2)
  };
  for (let d = 1; d <= HISTORY_DAYS; d++) {
    const date = isoDate(d);
    for (const u of ["u-1", "u-2", "u-3", "u-4", "u-5", "u-6"]) {
      const p = profile[u];
      if (rand() >= p.active) continue; // inactive that day → a "missed" cell
      for (const t of fajrTasks) {
        const full = rand() < p.quality;
        const frac = full ? 1 : 0.3 + rand() * 0.55;
        logs.push(log(u, t.id, date, Math.round(t.targetCount * frac)));
      }
    }
  }

  // Maghrib Circle (g-2) — lighter activity so it feels alive when an admin
  // who runs both circles switches into it. Today + ~21 days of history.
  const maghribTasks = tasks.filter((t) => t.groupId === "g-2");
  for (const u of ["u-1", "u-7", "u-8"]) {
    for (const t of maghribTasks) {
      logs.push(
        log(u, t.id, today, Math.round(t.targetCount * (0.3 + rand() * 0.6))),
      );
    }
  }
  for (let d = 1; d <= 21; d++) {
    const date = isoDate(d);
    for (const u of ["u-1", "u-7", "u-8"]) {
      if (rand() >= 0.75) continue;
      for (const t of maghribTasks) {
        const full = rand() < 0.8;
        logs.push(
          log(
            u,
            t.id,
            date,
            Math.round(t.targetCount * (full ? 1 : 0.4 + rand() * 0.5)),
          ),
        );
      }
    }
  }

  // ---- Streaks --------------------------------------------------------------
  const streaks: MockState["streaks"] = [
    {
      userId: "u-1",
      current: 12,
      longest: 21,
      freezesLeft: 1,
      lastActive: today,
    },
    {
      userId: "u-2",
      current: 7,
      longest: 15,
      freezesLeft: 1,
      lastActive: today,
    },
    {
      userId: "u-3",
      current: 23,
      longest: 23,
      freezesLeft: 0,
      lastActive: today,
    },
    {
      userId: "u-4",
      current: 4,
      longest: 9,
      freezesLeft: 1,
      lastActive: today,
    },
    {
      userId: "u-5",
      current: 31,
      longest: 31,
      freezesLeft: 1,
      lastActive: today,
    },
    {
      userId: "u-6",
      current: 2,
      longest: 18,
      freezesLeft: 0,
      lastActive: today,
    },
  ];

  return {
    users,
    groups,
    memberships,
    tasks,
    logs,
    streaks,
    session: { currentUserId: "u-1", activeGroupId: "g-1", viewRole: "member" },
    ui: { showRibbon: true },
  };
}
