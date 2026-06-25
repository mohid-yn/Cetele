/**
 * Mock domain types for the clickable prototype (CET-14).
 *
 * These deliberately mirror the PRD §6 data model and the generic D17
 * vocabulary (task / count / group — never "dhikr") so the eventual Supabase
 * schema maps 1:1 behind the same screen components. No backend here: all of
 * this lives in `localStorage` via the mock store.
 */

/** Per-group role. App-level admin is `User.isAdmin` (see D9). */
export type MemberRole = "member" | "group_admin";

/** The role the demo is currently *viewing as* (drives nav + gating). */
export type ViewRole = MemberRole | "admin";

export interface User {
  id: string;
  name: string;
  /** Optional avatar URL; the Avatar primitive falls back to initials. */
  avatarUrl?: string;
  /** App-level admin flag (PRD: `users.is_admin`). */
  isAdmin: boolean;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
}

export interface Membership {
  userId: string;
  groupId: string;
  role: MemberRole;
}

/** Generic trackable item (D17 `tasks` — replaces `dhikr_items`). */
export interface Task {
  id: string;
  groupId: string;
  /** e.g. "Allahu Akbar". */
  label: string;
  /** Optional secondary line — e.g. Arabic script (replaces `arabic`). */
  subtitle?: string;
  targetCount: number;
  sortOrder: number;
}

/** A user's count for one task on one day (PRD `logs`). */
export interface Log {
  id: string;
  userId: string;
  taskId: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  count: number;
}

export interface Streak {
  userId: string;
  current: number;
  longest: number;
  /** "Never miss twice" — number of streak-freezes available. */
  freezesLeft: number;
  /** ISO date of last activity. */
  lastActive: string;
}

/** A one-tap peer encouragement (CET-18) — a dua / kudos on a peer's day. */
export interface Reaction {
  id: string;
  /** Who sent it. */
  fromUserId: string;
  /** The peer being encouraged. */
  toUserId: string;
  groupId: string;
  /** Reaction kind — maps to a label + glyph (see REACTIONS in data). */
  kind: ReactionKind;
  /** ISO date the encouragement is for (usually today). */
  date: string;
}

export type ReactionKind = "dua" | "heart" | "fire" | "mashaAllah";

/** The full mock universe persisted to localStorage. */
export interface MockState {
  users: User[];
  groups: Group[];
  memberships: Membership[];
  tasks: Task[];
  logs: Log[];
  streaks: Streak[];
  /** One-tap peer encouragements (CET-18). */
  reactions: Reaction[];
  session: {
    currentUserId: string;
    activeGroupId: string;
    /** Demo affordance: which role we're viewing the app as. */
    viewRole: ViewRole;
  };
  ui: {
    /** Subtle "DEMO · mock data" ribbon. */
    showRibbon: boolean;
    /** Demo affordance: force the fresh-start re-engagement banner (CET-19). */
    freshStart: boolean;
  };
}
