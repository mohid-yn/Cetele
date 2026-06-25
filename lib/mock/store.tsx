"use client";

/**
 * Mock store for the clickable prototype (CET-14) — the reactive heart.
 *
 * React Context + useReducer, persisted to localStorage. No backend: a tap here
 * really moves the leaderboard and the live group total, and a setInterval
 * "realtime" ticker nudges peers so the collective counter climbs on its own.
 * When requirements lock, a real Supabase layer replaces this behind the same
 * hooks and selectors.
 */

import * as React from "react";
import { BADGES, createInitialState, isoDate, STORAGE_KEY } from "./data";
import type {
  Group,
  Log,
  MemberRole,
  MockState,
  Reaction,
  ReactionKind,
  Task,
  User,
  ViewRole,
} from "./types";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "hydrate"; state: MockState }
  | { type: "reset" }
  | { type: "increment"; userId: string; taskId: string; by: number }
  | { type: "setViewRole"; role: ViewRole }
  | { type: "setActiveGroup"; groupId: string }
  | { type: "toggleRibbon" }
  | { type: "addTask"; task: Omit<Task, "id" | "sortOrder"> }
  | {
      type: "editTask";
      taskId: string;
      patch: Partial<Pick<Task, "label" | "subtitle" | "targetCount">>;
    }
  | { type: "removeTask"; taskId: string }
  | { type: "inviteMember"; name: string; groupId: string }
  | { type: "removeMember"; userId: string; groupId: string }
  | { type: "setMemberRole"; userId: string; groupId: string; role: MemberRole }
  | {
      type: "addUserToGroup";
      userId: string;
      groupId: string;
      role: MemberRole;
    }
  | { type: "createGroup"; name: string; firstAdminId?: string }
  | { type: "renameGroup"; groupId: string; name: string }
  | { type: "deleteGroup"; groupId: string }
  | { type: "setAppAdmin"; userId: string; value: boolean }
  | {
      type: "sendReaction";
      fromUserId: string;
      toUserId: string;
      groupId: string;
      kind: ReactionKind;
    }
  | { type: "setFreshStart"; value: boolean }
  | { type: "fastForwardDay" };

let idSeq = 1000;
const nextId = (p: string) => `${p}-${++idSeq}`;

// Friendly, unambiguous invite codes (no 0/O/1/I): "FAJR-7K2".
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeInviteCode(name: string): string {
  const prefix = name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, "X");
  let suffix = "";
  for (let i = 0; i < 3; i++)
    suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `${prefix}-${suffix}`;
}

function reducer(state: MockState, action: Action): MockState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "reset":
      return createInitialState();

    case "increment": {
      const today = isoDate(0);
      const existing = state.logs.find(
        (l) =>
          l.userId === action.userId &&
          l.taskId === action.taskId &&
          l.date === today,
      );
      if (existing) {
        return {
          ...state,
          logs: state.logs.map((l) =>
            l === existing ? { ...l, count: l.count + action.by } : l,
          ),
        };
      }
      const log: Log = {
        id: nextId("l"),
        userId: action.userId,
        taskId: action.taskId,
        date: today,
        count: Math.max(0, action.by),
      };
      return { ...state, logs: [...state.logs, log] };
    }

    case "setViewRole":
      return { ...state, session: { ...state.session, viewRole: action.role } };

    case "setActiveGroup":
      return {
        ...state,
        session: { ...state.session, activeGroupId: action.groupId },
      };

    case "toggleRibbon":
      return {
        ...state,
        ui: { ...state.ui, showRibbon: !state.ui.showRibbon },
      };

    case "addTask": {
      const siblings = state.tasks.filter(
        (t) => t.groupId === action.task.groupId,
      );
      const task: Task = {
        ...action.task,
        id: nextId("t"),
        sortOrder: siblings.length,
      };
      return { ...state, tasks: [...state.tasks, task] };
    }

    case "editTask":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId ? { ...t, ...action.patch } : t,
        ),
      };

    case "removeTask":
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.taskId),
        logs: state.logs.filter((l) => l.taskId !== action.taskId),
      };

    case "inviteMember": {
      const user: User = { id: nextId("u"), name: action.name, isAdmin: false };
      return {
        ...state,
        users: [...state.users, user],
        memberships: [
          ...state.memberships,
          { userId: user.id, groupId: action.groupId, role: "member" },
        ],
        streaks: [
          ...state.streaks,
          {
            userId: user.id,
            current: 0,
            longest: 0,
            freezesLeft: 1,
            lastActive: isoDate(0),
          },
        ],
      };
    }

    case "removeMember":
      return {
        ...state,
        memberships: state.memberships.filter(
          (m) => !(m.userId === action.userId && m.groupId === action.groupId),
        ),
      };

    case "setMemberRole":
      return {
        ...state,
        memberships: state.memberships.map((m) =>
          m.userId === action.userId && m.groupId === action.groupId
            ? { ...m, role: action.role }
            : m,
        ),
      };

    case "addUserToGroup": {
      const existing = state.memberships.find(
        (m) => m.userId === action.userId && m.groupId === action.groupId,
      );
      if (existing)
        return {
          ...state,
          memberships: state.memberships.map((m) =>
            m === existing ? { ...m, role: action.role } : m,
          ),
        };
      return {
        ...state,
        memberships: [
          ...state.memberships,
          { userId: action.userId, groupId: action.groupId, role: action.role },
        ],
      };
    }

    case "createGroup": {
      const id = nextId("g");
      const group: Group = {
        id,
        name: action.name,
        inviteCode: makeInviteCode(action.name),
        createdBy: state.session.currentUserId,
      };
      const memberships = action.firstAdminId
        ? [
            ...state.memberships,
            {
              userId: action.firstAdminId,
              groupId: id,
              role: "group_admin" as MemberRole,
            },
          ]
        : state.memberships;
      return { ...state, groups: [...state.groups, group], memberships };
    }

    case "renameGroup":
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.groupId ? { ...g, name: action.name || g.name } : g,
        ),
      };

    case "deleteGroup": {
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      const removedTaskIds = new Set(
        state.tasks
          .filter((t) => t.groupId === action.groupId)
          .map((t) => t.id),
      );
      const activeGroupId =
        state.session.activeGroupId === action.groupId
          ? (groups[0]?.id ?? "")
          : state.session.activeGroupId;
      return {
        ...state,
        groups,
        memberships: state.memberships.filter(
          (m) => m.groupId !== action.groupId,
        ),
        tasks: state.tasks.filter((t) => t.groupId !== action.groupId),
        logs: state.logs.filter((l) => !removedTaskIds.has(l.taskId)),
        session: { ...state.session, activeGroupId },
      };
    }

    case "setAppAdmin":
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.userId ? { ...u, isAdmin: action.value } : u,
        ),
      };

    case "sendReaction": {
      const today = isoDate(0);
      const reactions = state.reactions ?? [];
      // One reaction of each kind per sender→peer per day (tap again to undo).
      const existing = reactions.find(
        (r) =>
          r.fromUserId === action.fromUserId &&
          r.toUserId === action.toUserId &&
          r.kind === action.kind &&
          r.date === today,
      );
      if (existing)
        return {
          ...state,
          reactions: reactions.filter((r) => r !== existing),
        };
      const r: Reaction = {
        id: nextId("r"),
        fromUserId: action.fromUserId,
        toUserId: action.toUserId,
        groupId: action.groupId,
        kind: action.kind,
        date: today,
      };
      return { ...state, reactions: [...reactions, r] };
    }

    case "setFreshStart":
      return { ...state, ui: { ...state.ui, freshStart: action.value } };

    case "fastForwardDay": {
      // Demo: advance one day for the logged-in user, applying the
      // "never miss twice" forgiveness rule, then reset today's rings.
      const uid = state.session.currentUserId;
      const gid = state.session.activeGroupId;
      const today = isoDate(0);
      const tasks = state.tasks.filter((t) => t.groupId === gid);
      const allComplete = tasks.every((t) => {
        const c = state.logs
          .filter(
            (l) => l.userId === uid && l.taskId === t.id && l.date === today,
          )
          .reduce((s, l) => s + l.count, 0);
        return c >= t.targetCount;
      });
      const streaks = state.streaks.map((s) => {
        if (s.userId !== uid) return s;
        if (allComplete) {
          const current = s.current + 1;
          return { ...s, current, longest: Math.max(current, s.longest) };
        }
        // Missed: spend a freeze if available (streak survives), else reset.
        if (s.freezesLeft > 0) return { ...s, freezesLeft: s.freezesLeft - 1 };
        return { ...s, current: 0 };
      });
      // Clear the logged-in user's today logs so rings reset for the "new day".
      const logs = state.logs.filter(
        (l) => !(l.userId === uid && l.date === today),
      );
      return { ...state, streaks, logs };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context + provider
// ---------------------------------------------------------------------------

interface MockContextValue {
  state: MockState;
  actions: {
    reset: () => void;
    increment: (taskId: string, by?: number, userId?: string) => void;
    setViewRole: (role: ViewRole) => void;
    setActiveGroup: (groupId: string) => void;
    toggleRibbon: () => void;
    addTask: (task: Omit<Task, "id" | "sortOrder">) => void;
    editTask: (
      taskId: string,
      patch: Partial<Pick<Task, "label" | "subtitle" | "targetCount">>,
    ) => void;
    removeTask: (taskId: string) => void;
    inviteMember: (name: string, groupId: string) => void;
    removeMember: (userId: string, groupId: string) => void;
    setMemberRole: (userId: string, groupId: string, role: MemberRole) => void;
    addUserToGroup: (userId: string, groupId: string, role: MemberRole) => void;
    createGroup: (name: string, firstAdminId?: string) => void;
    renameGroup: (groupId: string, name: string) => void;
    deleteGroup: (groupId: string) => void;
    setAppAdmin: (userId: string, value: boolean) => void;
    sendReaction: (
      toUserId: string,
      kind: ReactionKind,
      fromUserId?: string,
    ) => void;
    setFreshStart: (value: boolean) => void;
    fastForwardDay: () => void;
  };
}

const MockContext = React.createContext<MockContextValue | null>(null);

export function MockStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(
    reducer,
    undefined,
    createInitialState,
  );
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from localStorage once on the client (avoids SSR mismatch).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // Merge over a fresh seed so a partial/older-shaped persisted blob
        // (e.g. one saved before a field existed) backfills missing keys
        // instead of crashing selectors. Cheap forward-compatibility for the
        // localStorage-backed mock.
        const seed = createInitialState();
        const saved = JSON.parse(raw) as Partial<MockState>;
        const merged: MockState = {
          ...seed,
          ...saved,
          reactions: saved.reactions ?? seed.reactions,
          session: { ...seed.session, ...(saved.session ?? {}) },
          ui: { ...seed.ui, ...(saved.ui ?? {}) },
        };
        dispatch({ type: "hydrate", state: merged });
      }
    } catch {
      // ignore corrupt/absent storage — fall back to the seed
    }
    // Intentional one-shot hydration gate (client-only); not a render sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Persist on every change after hydration.
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota/serialisation errors in the demo
    }
  }, [state, hydrated]);

  // Simulated realtime: nudge a couple of peers' counts so the collective
  // counter and leaderboard move on their own during the demo.
  React.useEffect(() => {
    if (!hydrated) return;
    const id = window.setInterval(() => {
      const gid = state.session.activeGroupId;
      const today = isoDate(0);
      const peers = state.memberships
        .filter(
          (m) => m.groupId === gid && m.userId !== state.session.currentUserId,
        )
        .map((m) => m.userId);
      const tasks = state.tasks.filter((t) => t.groupId === gid);
      if (!peers.length || !tasks.length) return;
      const uid = peers[Math.floor(Math.random() * peers.length)];
      const task = tasks[Math.floor(Math.random() * tasks.length)];
      const current = state.logs
        .filter(
          (l) => l.userId === uid && l.taskId === task.id && l.date === today,
        )
        .reduce((s, l) => s + l.count, 0);
      if (current >= task.targetCount) return; // already done today
      const bump = Math.max(
        1,
        Math.round(task.targetCount * (0.01 + Math.random() * 0.04)),
      );
      dispatch({ type: "increment", userId: uid, taskId: task.id, by: bump });
    }, 3500);
    return () => window.clearInterval(id);
    // Re-arm when the active group changes; reads of state inside are fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state.session.activeGroupId]);

  const actions = React.useMemo<MockContextValue["actions"]>(
    () => ({
      reset: () => dispatch({ type: "reset" }),
      increment: (taskId, by = 1, userId) =>
        dispatch({
          type: "increment",
          taskId,
          by,
          userId: userId ?? state.session.currentUserId,
        }),
      setViewRole: (role) => dispatch({ type: "setViewRole", role }),
      setActiveGroup: (groupId) =>
        dispatch({ type: "setActiveGroup", groupId }),
      toggleRibbon: () => dispatch({ type: "toggleRibbon" }),
      addTask: (task) => dispatch({ type: "addTask", task }),
      editTask: (taskId, patch) =>
        dispatch({ type: "editTask", taskId, patch }),
      removeTask: (taskId) => dispatch({ type: "removeTask", taskId }),
      inviteMember: (name, groupId) =>
        dispatch({ type: "inviteMember", name, groupId }),
      removeMember: (userId, groupId) =>
        dispatch({ type: "removeMember", userId, groupId }),
      setMemberRole: (userId, groupId, role) =>
        dispatch({ type: "setMemberRole", userId, groupId, role }),
      addUserToGroup: (userId, groupId, role) =>
        dispatch({ type: "addUserToGroup", userId, groupId, role }),
      createGroup: (name, firstAdminId) =>
        dispatch({ type: "createGroup", name, firstAdminId }),
      renameGroup: (groupId, name) =>
        dispatch({ type: "renameGroup", groupId, name }),
      deleteGroup: (groupId) => dispatch({ type: "deleteGroup", groupId }),
      setAppAdmin: (userId, value) =>
        dispatch({ type: "setAppAdmin", userId, value }),
      sendReaction: (toUserId, kind, fromUserId) =>
        dispatch({
          type: "sendReaction",
          toUserId,
          kind,
          fromUserId: fromUserId ?? state.session.currentUserId,
          groupId: state.session.activeGroupId,
        }),
      setFreshStart: (value) => dispatch({ type: "setFreshStart", value }),
      fastForwardDay: () => dispatch({ type: "fastForwardDay" }),
    }),
    [state.session.currentUserId, state.session.activeGroupId],
  );

  const value = React.useMemo(() => ({ state, actions }), [state, actions]);

  if (!hydrated) return null;
  return <MockContext.Provider value={value}>{children}</MockContext.Provider>;
}

export function useMock(): MockContextValue {
  const ctx = React.useContext(MockContext);
  if (!ctx) throw new Error("useMock must be used within <MockStateProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Selectors (pure — operate on a MockState snapshot)
// ---------------------------------------------------------------------------

export const sel = {
  user: (s: MockState, userId: string): User | undefined =>
    s.users.find((u) => u.id === userId),

  currentUser: (s: MockState): User =>
    s.users.find((u) => u.id === s.session.currentUserId)!,

  activeGroup: (s: MockState): Group =>
    s.groups.find((g) => g.id === s.session.activeGroupId)!,

  groupTasks: (s: MockState, groupId: string): Task[] =>
    s.tasks
      .filter((t) => t.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder),

  /** Memberships of a group, joined with the user record. */
  groupMembers: (s: MockState, groupId: string) =>
    s.memberships
      .filter((m) => m.groupId === groupId)
      .map((m) => ({ ...m, user: s.users.find((u) => u.id === m.userId)! }))
      .filter((m) => m.user),

  membershipRole: (
    s: MockState,
    userId: string,
    groupId: string,
  ): MemberRole | undefined =>
    s.memberships.find((m) => m.userId === userId && m.groupId === groupId)
      ?.role,

  /** One user's total count for one task today. */
  todayCount: (s: MockState, userId: string, taskId: string): number =>
    s.logs
      .filter(
        (l) =>
          l.userId === userId && l.taskId === taskId && l.date === isoDate(0),
      )
      .reduce((sum, l) => sum + l.count, 0),

  /** Collective progress today across all members + tasks of a group. */
  groupToday: (
    s: MockState,
    groupId: string,
  ): { total: number; goal: number } => {
    const today = isoDate(0);
    const tasks = s.tasks.filter((t) => t.groupId === groupId);
    const taskIds = new Set(tasks.map((t) => t.id));
    const memberCount = s.memberships.filter(
      (m) => m.groupId === groupId,
    ).length;
    const total = s.logs
      .filter((l) => taskIds.has(l.taskId) && l.date === today)
      .reduce((sum, l) => sum + l.count, 0);
    const goal = tasks.reduce((sum, t) => sum + t.targetCount, 0) * memberCount;
    return { total, goal };
  },

  /** Weekly leaderboard: rank by days-active then total count over 7 days. */
  leaderboard: (s: MockState, groupId: string) => {
    const dates = new Set(Array.from({ length: 7 }, (_, i) => isoDate(i)));
    const taskIds = new Set(
      s.tasks.filter((t) => t.groupId === groupId).map((t) => t.id),
    );
    return sel
      .groupMembers(s, groupId)
      .map((m) => {
        const mine = s.logs.filter(
          (l) =>
            l.userId === m.userId && taskIds.has(l.taskId) && dates.has(l.date),
        );
        const total = mine.reduce((sum, l) => sum + l.count, 0);
        const daysActive = new Set(mine.map((l) => l.date)).size;
        const streak =
          s.streaks.find((x) => x.userId === m.userId)?.current ?? 0;
        return { ...m, total, daysActive, streak };
      })
      .sort((a, b) => b.daysActive - a.daysActive || b.total - a.total);
  },

  streak: (s: MockState, userId: string) =>
    s.streaks.find((x) => x.userId === userId),

  /** Every group a user belongs to, joined with their role in it (person-centric). */
  userGroups: (s: MockState, userId: string) =>
    s.memberships
      .filter((m) => m.userId === userId)
      .map((m) => ({ ...m, group: s.groups.find((g) => g.id === m.groupId)! }))
      .filter((m) => m.group),

  /** Users not currently in a group (candidates to add). */
  nonMembers: (s: MockState, groupId: string): User[] =>
    s.users.filter(
      (u) =>
        !s.memberships.some((m) => m.userId === u.id && m.groupId === groupId),
    ),

  /** Count of group_admins in a group (to protect the last admin). */
  adminCount: (s: MockState, groupId: string): number =>
    s.memberships.filter(
      (m) => m.groupId === groupId && m.role === "group_admin",
    ).length,

  // ---- Consistency tracker (CET-16) ----------------------------------------

  /** One user's completion for one date: how many of the group's tasks they
   *  fully closed (rings completed), plus whether the whole day was complete. */
  dayCompletion: (
    s: MockState,
    userId: string,
    groupId: string,
    date: string,
  ): {
    closed: number;
    total: number;
    pct: number;
    full: boolean;
    active: boolean;
  } => {
    const tasks = s.tasks.filter((t) => t.groupId === groupId);
    if (!tasks.length)
      return { closed: 0, total: 0, pct: 0, full: false, active: false };
    let closed = 0;
    let active = false;
    for (const t of tasks) {
      const c = s.logs
        .filter(
          (l) => l.userId === userId && l.taskId === t.id && l.date === date,
        )
        .reduce((sum, l) => sum + l.count, 0);
      if (c > 0) active = true;
      if (c >= t.targetCount) closed++;
    }
    return {
      closed,
      total: tasks.length,
      pct: closed / tasks.length,
      full: closed === tasks.length,
      active,
    };
  },

  /** Last `days` days of completion, oldest → newest (for the heatmap). */
  heatmap: (s: MockState, userId: string, groupId: string, days: number) =>
    Array.from({ length: days }, (_, i) => {
      const date = isoDate(days - 1 - i);
      return { date, ...sel.dayCompletion(s, userId, groupId, date) };
    }),

  /** Consistency = % of the last `days` days fully completed (all rings closed). */
  consistency: (
    s: MockState,
    userId: string,
    groupId: string,
    days: number,
  ): number => {
    let full = 0;
    for (let i = 0; i < days; i++) {
      if (sel.dayCompletion(s, userId, groupId, isoDate(i)).full) full++;
    }
    return Math.round((full / days) * 100);
  },

  /** Per-member consistency for the group-admin oversight view (sorted desc). */
  memberConsistency: (s: MockState, groupId: string, days: number) =>
    sel
      .groupMembers(s, groupId)
      .map((m) => ({
        ...m,
        score: sel.consistency(s, m.userId, groupId, days),
        streak: s.streaks.find((x) => x.userId === m.userId)?.current ?? 0,
      }))
      .sort((a, b) => b.score - a.score),

  /** Group collective consistency = mean of members' scores over `days`. */
  groupConsistency: (s: MockState, groupId: string, days: number): number => {
    const members = sel.groupMembers(s, groupId);
    if (!members.length) return 0;
    const sum = members.reduce(
      (acc, m) => acc + sel.consistency(s, m.userId, groupId, days),
      0,
    );
    return Math.round(sum / members.length);
  },

  // ---- Peer reactions (CET-18) ---------------------------------------------

  /** Has this user closed *every* ring today (the trigger for a reaction)? */
  doneToday: (s: MockState, userId: string, groupId: string): boolean =>
    sel.dayCompletion(s, userId, groupId, isoDate(0)).full,

  /**
   * Reactions for one peer on a date, grouped by kind with a count and whether
   * the current viewer has already sent that kind (for the toggle state).
   */
  reactionsTo: (s: MockState, toUserId: string, date = isoDate(0)) => {
    const mine = s.session.currentUserId;
    const here = (s.reactions ?? []).filter(
      (r) => r.toUserId === toUserId && r.date === date,
    );
    const byKind = new Map<string, { count: number; reacted: boolean }>();
    for (const r of here) {
      const cur = byKind.get(r.kind) ?? { count: 0, reacted: false };
      cur.count += 1;
      if (r.fromUserId === mine) cur.reacted = true;
      byKind.set(r.kind, cur);
    }
    return byKind;
  },

  /** Total encouragements a user has received today (for a glance badge). */
  reactionCount: (s: MockState, toUserId: string, date = isoDate(0)): number =>
    (s.reactions ?? []).filter(
      (r) => r.toUserId === toUserId && r.date === date,
    ).length,

  // ---- Achievement badges (CET-20) -----------------------------------------

  /** Every badge with its earned-state for a user (earned ones first). */
  badges: (s: MockState, userId: string, groupId: string) => {
    const st = s.streaks.find((x) => x.userId === userId);
    return BADGES.map((b) => {
      let earned = false;
      if (b.kind === "streakLongest")
        earned = (st?.longest ?? 0) >= b.threshold;
      else if (b.kind === "streakCurrent")
        earned = (st?.current ?? 0) >= b.threshold;
      else if (b.kind === "consistency")
        earned =
          sel.consistency(s, userId, groupId, b.window ?? 30) >= b.threshold;
      return { ...b, earned };
    }).sort((a, b) => Number(b.earned) - Number(a.earned));
  },

  // ---- Winnable pair goals (CET-22) ----------------------------------------

  /** A deterministic accountability buddy for a user within their group. */
  buddy: (s: MockState, userId: string, groupId: string) => {
    const others = sel
      .groupMembers(s, groupId)
      .filter((m) => m.userId !== userId);
    if (!others.length) return undefined;
    // Stable pairing: pick by a hash of the user id so it never reshuffles.
    const h = userId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return others[h % others.length];
  },

  /**
   * A winnable shared goal: the pair's combined days-active this week vs a
   * modest target (so two friends win together rather than out-ranking a group).
   */
  pairGoal: (s: MockState, userId: string, groupId: string) => {
    const buddy = sel.buddy(s, userId, groupId);
    if (!buddy) return undefined;
    const dates = Array.from({ length: 7 }, (_, i) => isoDate(i));
    const daysFor = (uid: string) =>
      dates.filter((d) => sel.dayCompletion(s, uid, groupId, d).active).length;
    const mine = daysFor(userId);
    const theirs = daysFor(buddy.userId);
    const target = 10; // combined active-days this week to "win" together
    return {
      buddy,
      mine,
      theirs,
      combined: mine + theirs,
      target,
      met: mine + theirs >= target,
    };
  },

  // ---- Group garden (CET-17) -----------------------------------------------

  /**
   * The collective garden's growth, driven by the group's 30-day consistency.
   * Returns a 0..4 stage and today's contribution so the garden visibly reacts
   * to *today's* effort too. Low stages are calm/dormant — never shaming (D8).
   */
  gardenStage: (s: MockState, groupId: string) => {
    const score = sel.groupConsistency(s, groupId, 30);
    const today = sel.groupToday(s, groupId);
    const todayPct = today.goal ? today.total / today.goal : 0;
    // Blend the durable 30-day signal with a nudge from today's progress, so
    // tapping toward today's goal visibly grows the garden in-session.
    const blended = Math.min(100, score + todayPct * 18);
    const stage = blended < 20 ? 0 : blended < 40 ? 1 : blended < 65 ? 2 : 3;
    return {
      stage,
      score,
      todayPct: Math.min(1, todayPct),
      vitality: blended / 100,
    };
  },
};
