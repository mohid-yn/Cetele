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
  PendingInvite,
  Reaction,
  ReactionKind,
  Task,
  User,
} from "./types";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: "hydrate"; state: MockState }
  | { type: "reset" }
  | {
      type: "increment";
      userId: string;
      taskId: string;
      by: number;
      /** Which day to log for — defaults to today (D8: back-fill a missed day). */
      date?: string;
    }
  | {
      // Admin proxy-logging (D29): set the *exact* count for one member/task/day
      // (the editable breakdown grid). Attribution is derived in the reducer.
      type: "setCount";
      userId: string;
      taskId: string;
      date: string;
      count: number;
    }
  | {
      // Admin proxy-logging (D29): mark a task done for the *whole circle* today
      // (the in-person halaqah "log for the group" quick action).
      type: "logForGroup";
      groupId: string;
      taskId: string;
      date: string;
      count: number;
    }
  | { type: "setCurrentUser"; userId: string }
  | { type: "setActiveGroup"; groupId: string }
  | { type: "toggleRibbon" }
  | { type: "addTask"; task: Omit<Task, "id" | "sortOrder"> }
  | {
      type: "editTask";
      taskId: string;
      patch: Partial<Pick<Task, "label" | "subtitle" | "targetCount">>;
    }
  | { type: "removeTask"; taskId: string }
  | { type: "removeMember"; userId: string; groupId: string }
  | { type: "setMemberRole"; userId: string; groupId: string; role: MemberRole }
  | {
      type: "addUserToGroup";
      userId: string;
      groupId: string;
      role: MemberRole;
    }
  | {
      type: "inviteByEmail";
      groupId: string;
      email: string;
      role: PendingInvite["role"];
    }
  | { type: "acceptInvite"; inviteId: string }
  | { type: "transferOwnership"; groupId: string; newOwnerId: string }
  | { type: "claimOwnership"; groupId: string }
  | { type: "toggleOwnerDormant" }
  | { type: "createGroup"; name: string }
  | { type: "renameGroup"; groupId: string; name: string }
  | { type: "deleteGroup"; groupId: string }
  | {
      type: "sendReaction";
      fromUserId: string;
      toUserId: string;
      groupId: string;
      kind: ReactionKind;
    }
  | { type: "setFreshStart"; value: boolean }
  // CET-11: edit a personal reminder's custom time / on-off (current user).
  | { type: "setReminderTime"; taskId: string; time: string }
  | { type: "toggleReminder"; taskId: string }
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
      const date = action.date ?? isoDate(0);
      const existing = state.logs.find(
        (l) =>
          l.userId === action.userId &&
          l.taskId === action.taskId &&
          l.date === date,
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
        date,
        count: Math.max(0, action.by),
      };
      return { ...state, logs: [...state.logs, log] };
    }

    case "setCount": {
      // D29 proxy-logging: collapse any logs for this member/task/day into one
      // authoritative row at the given count. Attributed to the acting user
      // unless they're editing their *own* record (self-correct → no "logged by").
      const { userId, taskId, date } = action;
      const count = Math.max(0, Math.round(action.count));
      const loggedBy =
        userId === state.session.currentUserId
          ? undefined
          : state.session.currentUserId;
      const logs = state.logs.filter(
        (l) => !(l.userId === userId && l.taskId === taskId && l.date === date),
      );
      if (count > 0) {
        logs.push({ id: nextId("l"), userId, taskId, date, count, loggedBy });
      }
      return { ...state, logs };
    }

    case "logForGroup": {
      // D29: the halaqah "log for the group" — set one task's count for every
      // member on a day, each row attributed to the acting admin (self = none).
      const { groupId, taskId, date } = action;
      const count = Math.max(0, Math.round(action.count));
      const memberIds = state.memberships
        .filter((m) => m.groupId === groupId)
        .map((m) => m.userId);
      const memberSet = new Set(memberIds);
      const logs = state.logs.filter(
        (l) =>
          !(memberSet.has(l.userId) && l.taskId === taskId && l.date === date),
      );
      if (count > 0) {
        for (const uid of memberIds) {
          logs.push({
            id: nextId("l"),
            userId: uid,
            taskId,
            date,
            count,
            loggedBy:
              uid === state.session.currentUserId
                ? undefined
                : state.session.currentUserId,
          });
        }
      }
      return { ...state, logs };
    }

    case "setCurrentUser": {
      // Demo affordance: "act as" another person. Snap the active group to one
      // they actually belong to so every screen stays in a valid context.
      const theirGroup = state.memberships.find(
        (m) => m.userId === action.userId,
      )?.groupId;
      return {
        ...state,
        session: {
          ...state.session,
          currentUserId: action.userId,
          activeGroupId: theirGroup ?? state.session.activeGroupId,
        },
      };
    }

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

    case "inviteByEmail": {
      // Mock of Drive's share-by-email: record a pending invite (no real mail).
      const invite: PendingInvite = {
        id: nextId("pi"),
        groupId: action.groupId,
        email: action.email,
        role: action.role,
        code: makeInviteCode(action.email.split("@")[0] || "JOIN"),
      };
      return { ...state, pendingInvites: [...state.pendingInvites, invite] };
    }

    case "acceptInvite": {
      const invite = state.pendingInvites.find((i) => i.id === action.inviteId);
      if (!invite) return state;
      // Create a lightweight user from the email's local-part (demo onboarding).
      const name = invite.email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const user: User = { id: nextId("u"), name };
      return {
        ...state,
        users: [...state.users, user],
        memberships: [
          ...state.memberships,
          { userId: user.id, groupId: invite.groupId, role: invite.role },
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
        pendingInvites: state.pendingInvites.filter((i) => i !== invite),
      };
    }

    case "transferOwnership": {
      // Owner-only (UI-gated): the old owner steps down to co-admin, the new
      // owner is promoted, and `createdBy` follows so ownership has one source.
      const oldOwnerId = state.groups.find(
        (g) => g.id === action.groupId,
      )?.createdBy;
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.groupId ? { ...g, createdBy: action.newOwnerId } : g,
        ),
        memberships: state.memberships.map((m) => {
          if (m.groupId !== action.groupId) return m;
          if (m.userId === action.newOwnerId) return { ...m, role: "owner" };
          if (m.userId === oldOwnerId) return { ...m, role: "admin" };
          return m;
        }),
      };
    }

    case "claimOwnership": {
      // D27 succession: a co-admin takes over a group whose owner is dormant or
      // gone, so a single owner leaving never orphans the circle. Guarded so
      // only a co-admin can claim, and only when the owner really is away.
      const me = state.session.currentUserId;
      const myRole = state.memberships.find(
        (m) => m.userId === me && m.groupId === action.groupId,
      )?.role;
      const oldOwnerId = state.groups.find(
        (g) => g.id === action.groupId,
      )?.createdBy;
      const ownerGone = !state.memberships.some(
        (m) => m.userId === oldOwnerId && m.groupId === action.groupId,
      );
      if (myRole !== "admin" || !(state.ui.ownerDormant || ownerGone))
        return state;
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.id === action.groupId ? { ...g, createdBy: me } : g,
        ),
        memberships: state.memberships.map((m) => {
          if (m.groupId !== action.groupId) return m;
          if (m.userId === me) return { ...m, role: "owner" };
          if (m.userId === oldOwnerId) return { ...m, role: "admin" };
          return m;
        }),
        ui: { ...state.ui, ownerDormant: false },
      };
    }

    case "toggleOwnerDormant":
      return {
        ...state,
        ui: { ...state.ui, ownerDormant: !state.ui.ownerDormant },
      };

    case "removeMember": {
      // Never remove the owner — they must transfer ownership first.
      const target = state.memberships.find(
        (m) => m.userId === action.userId && m.groupId === action.groupId,
      );
      if (target?.role === "owner") return state;
      return {
        ...state,
        memberships: state.memberships.filter(
          (m) => !(m.userId === action.userId && m.groupId === action.groupId),
        ),
      };
    }

    case "setMemberRole": {
      // Owner role is set only via transfer; never toggle to/from it here.
      if (action.role === "owner") return state;
      return {
        ...state,
        memberships: state.memberships.map((m) =>
          m.userId === action.userId &&
          m.groupId === action.groupId &&
          m.role !== "owner"
            ? { ...m, role: action.role }
            : m,
        ),
      };
    }

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
      // Self-serve (D26): whoever creates a group becomes its owner.
      const id = nextId("g");
      const owner = state.session.currentUserId;
      const group: Group = {
        id,
        name: action.name,
        inviteCode: makeInviteCode(action.name),
        createdBy: owner,
      };
      return {
        ...state,
        groups: [...state.groups, group],
        memberships: [
          ...state.memberships,
          { userId: owner, groupId: id, role: "owner" as MemberRole },
        ],
        // Drop the creator straight into their new group.
        session: { ...state.session, activeGroupId: id },
      };
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
        pendingInvites: state.pendingInvites.filter(
          (i) => i.groupId !== action.groupId,
        ),
        session: { ...state.session, activeGroupId },
      };
    }

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

    case "setReminderTime": {
      // CET-11: set this user's reminder time for a task; create the row (on)
      // if they hadn't customised it yet.
      const uid = state.session.currentUserId;
      const has = state.reminders.some(
        (r) => r.userId === uid && r.taskId === action.taskId,
      );
      const reminders = has
        ? state.reminders.map((r) =>
            r.userId === uid && r.taskId === action.taskId
              ? { ...r, time: action.time }
              : r,
          )
        : [
            ...state.reminders,
            { userId: uid, taskId: action.taskId, time: action.time, on: true },
          ];
      return { ...state, reminders };
    }

    case "toggleReminder": {
      const uid = state.session.currentUserId;
      const has = state.reminders.some(
        (r) => r.userId === uid && r.taskId === action.taskId,
      );
      const reminders = has
        ? state.reminders.map((r) =>
            r.userId === uid && r.taskId === action.taskId
              ? { ...r, on: !r.on }
              : r,
          )
        : [
            ...state.reminders,
            { userId: uid, taskId: action.taskId, time: "09:00", on: true },
          ];
      return { ...state, reminders };
    }

    case "fastForwardDay": {
      // Demo: advance one day for the logged-in user, applying the
      // "never miss twice" forgiveness rule, then reset today's rings.
      const uid = state.session.currentUserId;
      const gid = state.session.activeGroupId;
      const today = isoDate(0);
      const tasks = state.tasks.filter((t) => t.groupId === gid);
      const taskIds = new Set(tasks.map((t) => t.id));
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

      // Garden progression demo: a day passes in which the whole circle does
      // well. The garden is driven by *durable* 30-day group consistency, so we
      // complete each member's most-recent not-yet-full past day — one notch per
      // press — making the garden visibly grow over time as you fast-forward.
      let logs = state.logs;
      const members = state.memberships
        .filter((m) => m.groupId === gid)
        .map((m) => m.userId);
      const dayFull = (uId: string, date: string) =>
        tasks.every(
          (t) =>
            logs
              .filter(
                (l) => l.userId === uId && l.taskId === t.id && l.date === date,
              )
              .reduce((s, l) => s + l.count, 0) >= t.targetCount,
        );
      for (const m of members) {
        // Most recent past day (yesterday → 29 days ago) not yet fully closed.
        let fillDate: string | null = null;
        for (let d = 1; d <= 29; d++) {
          const date = isoDate(d);
          if (!dayFull(m, date)) {
            fillDate = date;
            break;
          }
        }
        if (!fillDate) continue; // already perfect across the window
        // Top that day up to a full set of closed rings for this member.
        logs = logs.filter(
          (l) =>
            !(l.userId === m && l.date === fillDate && taskIds.has(l.taskId)),
        );
        for (const t of tasks) {
          logs.push({
            id: nextId("l"),
            userId: m,
            taskId: t.id,
            date: fillDate,
            count: t.targetCount,
          });
        }
      }

      // Clear the logged-in user's today logs so rings reset for the "new day".
      logs = logs.filter((l) => !(l.userId === uid && l.date === today));
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
    increment: (
      taskId: string,
      by?: number,
      userId?: string,
      date?: string,
    ) => void;
    /** D29: set the exact count for one member/task/day (editable breakdown). */
    setCount: (
      userId: string,
      taskId: string,
      date: string,
      count: number,
    ) => void;
    /** D29: mark one task done for the whole circle on a day (halaqah log). */
    logForGroup: (
      groupId: string,
      taskId: string,
      date: string,
      count: number,
    ) => void;
    setCurrentUser: (userId: string) => void;
    setActiveGroup: (groupId: string) => void;
    toggleRibbon: () => void;
    addTask: (task: Omit<Task, "id" | "sortOrder">) => void;
    editTask: (
      taskId: string,
      patch: Partial<Pick<Task, "label" | "subtitle" | "targetCount">>,
    ) => void;
    removeTask: (taskId: string) => void;
    removeMember: (userId: string, groupId: string) => void;
    setMemberRole: (userId: string, groupId: string, role: MemberRole) => void;
    addUserToGroup: (userId: string, groupId: string, role: MemberRole) => void;
    inviteByEmail: (
      groupId: string,
      email: string,
      role: PendingInvite["role"],
    ) => void;
    acceptInvite: (inviteId: string) => void;
    transferOwnership: (groupId: string, newOwnerId: string) => void;
    claimOwnership: (groupId: string) => void;
    toggleOwnerDormant: () => void;
    createGroup: (name: string) => void;
    renameGroup: (groupId: string, name: string) => void;
    deleteGroup: (groupId: string) => void;
    sendReaction: (
      toUserId: string,
      kind: ReactionKind,
      fromUserId?: string,
    ) => void;
    setFreshStart: (value: boolean) => void;
    /** CET-11: set the current user's reminder time (24h "HH:MM") for a task. */
    setReminderTime: (taskId: string, time: string) => void;
    /** CET-11: toggle the current user's reminder for a task on/off. */
    toggleReminder: (taskId: string) => void;
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
          reminders: saved.reminders ?? seed.reminders,
          pendingInvites: saved.pendingInvites ?? seed.pendingInvites,
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
      increment: (taskId, by = 1, userId, date) =>
        dispatch({
          type: "increment",
          taskId,
          by,
          userId: userId ?? state.session.currentUserId,
          date,
        }),
      setCount: (userId, taskId, date, count) =>
        dispatch({ type: "setCount", userId, taskId, date, count }),
      logForGroup: (groupId, taskId, date, count) =>
        dispatch({ type: "logForGroup", groupId, taskId, date, count }),
      setCurrentUser: (userId) => dispatch({ type: "setCurrentUser", userId }),
      setActiveGroup: (groupId) =>
        dispatch({ type: "setActiveGroup", groupId }),
      toggleRibbon: () => dispatch({ type: "toggleRibbon" }),
      addTask: (task) => dispatch({ type: "addTask", task }),
      editTask: (taskId, patch) =>
        dispatch({ type: "editTask", taskId, patch }),
      removeTask: (taskId) => dispatch({ type: "removeTask", taskId }),
      removeMember: (userId, groupId) =>
        dispatch({ type: "removeMember", userId, groupId }),
      setMemberRole: (userId, groupId, role) =>
        dispatch({ type: "setMemberRole", userId, groupId, role }),
      addUserToGroup: (userId, groupId, role) =>
        dispatch({ type: "addUserToGroup", userId, groupId, role }),
      inviteByEmail: (groupId, email, role) =>
        dispatch({ type: "inviteByEmail", groupId, email, role }),
      acceptInvite: (inviteId) => dispatch({ type: "acceptInvite", inviteId }),
      transferOwnership: (groupId, newOwnerId) =>
        dispatch({ type: "transferOwnership", groupId, newOwnerId }),
      claimOwnership: (groupId) =>
        dispatch({ type: "claimOwnership", groupId }),
      toggleOwnerDormant: () => dispatch({ type: "toggleOwnerDormant" }),
      createGroup: (name) => dispatch({ type: "createGroup", name }),
      renameGroup: (groupId, name) =>
        dispatch({ type: "renameGroup", groupId, name }),
      deleteGroup: (groupId) => dispatch({ type: "deleteGroup", groupId }),
      sendReaction: (toUserId, kind, fromUserId) =>
        dispatch({
          type: "sendReaction",
          toUserId,
          kind,
          fromUserId: fromUserId ?? state.session.currentUserId,
          groupId: state.session.activeGroupId,
        }),
      setFreshStart: (value) => dispatch({ type: "setFreshStart", value }),
      setReminderTime: (taskId, time) =>
        dispatch({ type: "setReminderTime", taskId, time }),
      toggleReminder: (taskId) => dispatch({ type: "toggleReminder", taskId }),
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

  /** One user's total count for one task on a given day (defaults to today). */
  countOn: (
    s: MockState,
    userId: string,
    taskId: string,
    date: string = isoDate(0),
  ): number =>
    s.logs
      .filter(
        (l) => l.userId === userId && l.taskId === taskId && l.date === date,
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

  /** Groups a user *owns* — their "My groups" (Drive's My Drive). */
  myGroups: (s: MockState, userId: string) =>
    sel.userGroups(s, userId).filter((m) => m.role === "owner"),

  /** Groups *shared with* a user as a co-admin — Drive's "Shared with me". */
  sharedWithMe: (s: MockState, userId: string) =>
    sel.userGroups(s, userId).filter((m) => m.role === "admin"),

  /** The owner of a group (from `createdBy`). */
  groupOwner: (s: MockState, groupId: string): User | undefined => {
    const ownerId = s.groups.find((g) => g.id === groupId)?.createdBy;
    return s.users.find((u) => u.id === ownerId);
  },

  /** Can this user manage the group? (owner or shared co-admin) */
  canManageGroup: (s: MockState, userId: string, groupId: string): boolean => {
    const r = sel.membershipRole(s, userId, groupId);
    return r === "owner" || r === "admin";
  },

  /**
   * Is the group's owner dormant or gone? (D27 succession) — true if the demo
   * "owner dormant" switch is on, the owner has left the group, or the owner
   * hasn't logged anything here in ≥ 14 days. When true, a co-admin may claim
   * ownership so the circle never orphans.
   */
  isOwnerDormant: (s: MockState, groupId: string): boolean => {
    if (s.ui.ownerDormant) return true;
    const ownerId = s.groups.find((g) => g.id === groupId)?.createdBy;
    if (!ownerId) return true;
    const inGroup = s.memberships.some(
      (m) => m.userId === ownerId && m.groupId === groupId,
    );
    if (!inGroup) return true; // owner left → gone
    const taskIds = new Set(
      s.tasks.filter((t) => t.groupId === groupId).map((t) => t.id),
    );
    const recent = new Set(Array.from({ length: 14 }, (_, i) => isoDate(i)));
    const activeLately = s.logs.some(
      (l) =>
        l.userId === ownerId && taskIds.has(l.taskId) && recent.has(l.date),
    );
    return !activeLately;
  },

  /** Outstanding email invites for a group (D26 share-by-email). */
  pendingInvitesFor: (s: MockState, groupId: string) =>
    s.pendingInvites.filter((i) => i.groupId === groupId),

  /** Users not currently in a group (candidates to add directly). */
  nonMembers: (s: MockState, groupId: string): User[] =>
    s.users.filter(
      (u) =>
        !s.memberships.some((m) => m.userId === u.id && m.groupId === groupId),
    ),

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

  /**
   * Per-task completion grid for one member over the last `days` days — the
   * admin "ask about specific days" breakdown. Rows = the group's tasks; each
   * row carries a cell per day (oldest → newest) with the raw count vs target
   * and whether the ring closed. Kept fortnight-sized by callers so it's cheap
   * to store/query; behind a real backend this is one `logs` range scan.
   */
  taskBreakdown: (
    s: MockState,
    userId: string,
    groupId: string,
    days: number,
  ) => {
    const tasks = sel.groupTasks(s, groupId);
    const dates = Array.from({ length: days }, (_, i) => isoDate(days - 1 - i));
    const rows = tasks.map((t) => ({
      task: t,
      cells: dates.map((date) => {
        const matches = s.logs.filter(
          (l) => l.userId === userId && l.taskId === t.id && l.date === date,
        );
        const count = matches.reduce((sum, l) => sum + l.count, 0);
        return {
          date,
          count,
          target: t.targetCount,
          pct: t.targetCount ? Math.min(1, count / t.targetCount) : 0,
          full: count >= t.targetCount,
          // D29: who logged this on the member's behalf, if anyone.
          loggedBy: matches.find((l) => l.loggedBy)?.loggedBy,
        };
      }),
    }));
    return { dates, rows };
  },

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

  // ---- Steadfastness recognition (D31) -------------------------------------

  /**
   * D31 — steadfastness = average daily completion % over a *sliding* window
   * (default 90 days), with **partial credit** per day (mean ring-fill, so a
   * member at ~95% every day scores ~95, not 0). A **rate**, never cumulative
   * volume or tenure → catchable, recency-bounded, seniority-invisible. The
   * average is taken over the member's enrolled span (earliest activity → today,
   * capped at the window) so missed days count against frequency but pre-join
   * days don't drag them down. Returns the % + active-day count for the ≥14-day
   * eligibility floor. Admin/owner-only surface (no member-facing board → no
   * riya'); any reward is the group's own, handled outside the app.
   */
  steadfastness: (
    s: MockState,
    userId: string,
    groupId: string,
    windowDays = 90,
  ): { pct: number; measuredDays: number; eligible: boolean } => {
    const tasks = s.tasks.filter((t) => t.groupId === groupId);
    const mine = s.logs.filter((l) => l.userId === userId);
    if (!tasks.length || !mine.length)
      return { pct: 0, measuredDays: 0, eligible: false };
    // Enrolled span ≈ days from the member's earliest activity to today (capped
    // at the window) — stands in for a real join date the mock doesn't store.
    const today = Date.parse(isoDate(0));
    let oldest = 0;
    for (const l of mine) {
      const dago = Math.round((today - Date.parse(l.date)) / 86_400_000);
      if (dago > oldest && dago < 365) oldest = dago;
    }
    const span = Math.min(windowDays, oldest + 1);
    let sum = 0;
    let activeDays = 0;
    for (let i = 0; i < span; i++) {
      const date = isoDate(i);
      let fill = 0;
      let active = false;
      for (const t of tasks) {
        const c = s.logs
          .filter(
            (l) => l.userId === userId && l.taskId === t.id && l.date === date,
          )
          .reduce((a, l) => a + l.count, 0);
        if (c > 0) active = true;
        fill += t.targetCount ? Math.min(1, c / t.targetCount) : 0;
      }
      if (active) activeDays++;
      sum += fill / tasks.length; // a missed day contributes 0 → rewards frequency
    }
    const pct = span ? Math.round((sum / span) * 100) : 0;
    return { pct, measuredDays: activeDays, eligible: activeDays >= 14 };
  },

  /**
   * D31 — the admin/owner-only steadfastness board: every member's recent
   * consistency rate (sliding window, partial credit), with the ≥14-day
   * eligibility floor and a recognition **bar** (not a single winner). Sorted
   * eligible-first, then by %. Private to managers — never a member-facing
   * leaderboard.
   */
  steadfastnessBoard: (
    s: MockState,
    groupId: string,
    windowDays = 90,
    barPct = 85,
  ) =>
    sel
      .groupMembers(s, groupId)
      .map((m) => {
        const r = sel.steadfastness(s, m.userId, groupId, windowDays);
        return { ...m, ...r, meetsBar: r.eligible && r.pct >= barPct };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.pct - a.pct),

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

  /**
   * CET-11: a user's reminders for a group's tasks — one row per task, joined
   * with its current custom time + on/off (defaults for tasks not yet
   * customised). Sorted by task order so the list reads top-to-bottom.
   */
  remindersFor: (s: MockState, userId: string, groupId: string) =>
    sel.groupTasks(s, groupId).map((task) => {
      const r = s.reminders.find(
        (x) => x.userId === userId && x.taskId === task.id,
      );
      return { task, time: r?.time ?? "09:00", on: r?.on ?? false };
    }),
};
