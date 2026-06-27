/**
 * Mock domain types for the clickable prototype (CET-14).
 *
 * These deliberately mirror the PRD §6 data model and the generic D17
 * vocabulary (task / count / group — never "dhikr") so the eventual Supabase
 * schema maps 1:1 behind the same screen components. No backend here: all of
 * this lives in `localStorage` via the mock store.
 */

/**
 * Per-group role (Drive-style ownership model — D26, supersedes D9).
 * - `owner`  — the creator; full control + share/transfer/delete (one per group).
 * - `admin`  — a shared **co-admin**: full manage + re-share, but can't delete
 *              the group or transfer ownership.
 * - `member` — participates (logs counts); no management.
 * There is no app-level admin tier any more — "app admin" *is* "group owner".
 */
export type MemberRole = "owner" | "admin" | "member";

export interface User {
  id: string;
  name: string;
  /** Optional avatar URL; the Avatar primitive falls back to initials. */
  avatarUrl?: string;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  /** The owner's userId — authoritative for ownership; updated on transfer. */
  createdBy: string;
}

export interface Membership {
  userId: string;
  groupId: string;
  role: MemberRole;
}

/**
 * A not-yet-accepted email invite (mock of Drive's share-by-email). Real
 * email is out of scope for the prototype — the invite surfaces as a pending
 * row + a copyable link/code, and can be "accepted" from Demo Controls.
 */
export interface PendingInvite {
  id: string;
  groupId: string;
  email: string;
  /** What they'll become on accept — a participant or a shared co-admin. */
  role: Exclude<MemberRole, "owner">;
  /** Single-use join code carried by the invite link. */
  code: string;
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
  /**
   * Admin proxy-logging (D29): when set, the admin/owner userId who logged this
   * on the member's behalf (e.g. tallying an in-person halaqah). Absent = the
   * member logged it themselves. Surfaced as "logged by …" + audited; the member
   * can always see and correct their own record.
   */
  loggedBy?: string;
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

/**
 * A personal per-task daily reminder (CET-11). The trigger that the Hook loop /
 * Fogg B=MAP both start from. Custom **clock time**, fully user-set — flexibility
 * over rigid prayer-anchoring (product-owner call; prayer-time quick-fill could
 * layer on later). Real build sends Web Push from a cron (D10); the mock just
 * persists the settings + shows a simulated notification.
 */
export interface Reminder {
  userId: string;
  taskId: string;
  /** 24-hour local time, "HH:MM" (matches `<input type="time">`). */
  time: string;
  on: boolean;
}

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
  /** Personal per-task daily reminders (CET-11) — custom clock times. */
  reminders: Reminder[];
  /** Outstanding email invites (D26 share-by-email). */
  pendingInvites: PendingInvite[];
  session: {
    currentUserId: string;
    activeGroupId: string;
  };
  ui: {
    /** Subtle "DEMO · mock data" ribbon. */
    showRibbon: boolean;
    /** Demo affordance: force the fresh-start re-engagement banner (CET-19). */
    freshStart: boolean;
    /** Demo affordance: simulate the active group's owner being dormant, so a
     *  co-admin can demo claiming ownership (D27 succession). */
    ownerDormant: boolean;
  };
}
