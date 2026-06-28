# Migration plan — mock store → Supabase (and client-heavy → server-first)

> **Status:** planning doc. Nothing here is built yet — it's deferred behind the
> requirements-lock gate (**D18**). This is the concrete "how" for **CET-2**
> (schema + RLS) → **CET-3** (auth) → **CET-6/7/8/9** (the real data features),
> written so the switch is a known quantity before we start spending on backend.
>
> **Read together with:** `docs/PRD.md` §6 (data model), `.claude/STATUS.md`
> (decisions D2/D17/D18 + the Drive-style ownership model **D26/D27/D29/D30**),
> and the mock it replaces: `lib/mock/{types,data,store}`.

---

## 1. Guiding principle

**Swap the data layer behind the same component API.** The mock was built for
this: `lib/mock/types.ts` mirrors PRD §6 1:1, and every read goes through a pure
selector (`sel.*`) while every write goes through a reducer action. So the job is
not a rewrite — it's:

1. Stand up Postgres tables that match the mock types.
2. Replace **reads** (`sel.*`) with SQL queries, run in **Server Components**.
3. Replace **writes** (reducer actions) with **Server Actions**.
4. Replace the **simulated realtime** (`setInterval`) with Supabase Realtime.
5. Replace the **fake session** (the demo "act as" persona switch) with Supabase Auth.

The UI primitives (`components/ui/*`), design tokens, routing, and layouts **do
not change**. Most feature components change only in _where their data comes from_.

---

## 2. The two shifts happening at once

|                        | Today (mock)                                                                                                          | Target (production)                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Data source**        | one React Context + `useReducer` + `localStorage` (`MockStateProvider`)                                               | Supabase Postgres, via `@supabase/ssr` clients                                                                      |
| **Rendering**          | 12/16 pages are `"use client"` (the whole `(app)` subtree is client, because the layout wraps it in a client Context) | **Server Components fetch data**; `"use client"` drops to leaves (tap pad, dialogs, toggles, realtime counter)      |
| **Reads**              | `sel.foo(state, …)` pure selectors                                                                                    | `await supabase.from(...).select(...)` in Server Components / RSC helpers                                           |
| **Writes**             | `dispatch({ type: "increment", … })`                                                                                  | **Server Actions** (`"use server"`) → `supabase…upsert/insert` → `revalidatePath`                                   |
| **Realtime**           | `setInterval` nudging peer counts                                                                                     | Supabase Realtime channel on `logs` (postgres_changes)                                                              |
| **Identity / roles**   | `session.currentUserId` + demo "act as" persona switch                                                                | Supabase Auth session; role derived from `memberships.role` (`owner`/`admin`/`member`, D26) — **no app-admin flag** |
| **Streaks / rollover** | `fastForwardDay` demo action                                                                                          | Scheduled job (Vercel cron or `pg_cron`/Edge Function) at day boundary                                              |

> The client-heavy shape is **not** the production shape. The idiomatic Next.js
> move is server-fetching with client leaves — don't port "everything behind one
> Context" forward. The pure selectors make this clean.

---

## 3. Schema (Postgres) — maps the mock types 1:1

App data lives in `public.*`; Supabase Auth owns `auth.users`. `User` (mock) →
`profiles` (a row per auth user). Generic D17 vocabulary throughout (`tasks`, not
`dhikr_items`).

```sql
-- profiles: 1:1 with auth.users. NO app-admin flag (D26 removed the tier).
-- One out-of-band recovery/moderation flag, set ONLY in Supabase (D27).
create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  name           text not null,
  avatar_url     text,
  is_super_admin boolean not null default false,  -- D27: recovery + moderation only, no in-app UI
  created_at     timestamptz not null default now()
);

create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid references profiles on delete set null,  -- D26: the OWNER (authoritative; follows transfer/succession)
  created_at  timestamptz not null default now()
);

-- D26 Drive-style roles: owner | admin (co-admin) | member. Exactly one
-- `owner` row per group (= groups.created_by, kept in sync on transfer).
create table memberships (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles on delete cascade,
  group_id  uuid not null references groups on delete cascade,
  role      text not null default 'member' check (role in ('owner','admin','member')),
  unique (user_id, group_id)
);
-- enforce one owner per group
create unique index one_owner_per_group on memberships (group_id) where role = 'owner';

create table tasks (                      -- D17: replaces dhikr_items
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups on delete cascade,
  label        text not null,
  subtitle     text,                      -- optional (was `arabic`)
  target_count integer not null check (target_count > 0),
  sort_order   integer not null default 0
);

create table logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  task_id    uuid not null references tasks on delete cascade,
  date       date not null,
  count      integer not null default 0 check (count >= 0),
  logged_by  uuid references profiles on delete set null,  -- D29: admin who proxy-logged; null = self
  updated_at timestamptz not null default now(),
  unique (user_id, task_id, date)         -- enables the increment upsert
);
create index on logs (task_id, date);     -- collective counter
create index on logs (user_id, date);     -- consistency / breakdown scans

-- D26: outstanding share-by-email invites (accept → a membership row).
create table invites (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups on delete cascade,
  email     text not null,
  role      text not null check (role in ('admin','member')),  -- can't invite straight to owner
  code      text not null unique,
  created_at timestamptz not null default now()
);

-- D30: personal per-task custom reminder times (member-set clock time + on/off).
create table reminders (
  user_id uuid not null references profiles on delete cascade,
  task_id uuid not null references tasks on delete cascade,
  time    text not null,                  -- "HH:MM" 24h local
  on      boolean not null default true,
  primary key (user_id, task_id)
);

create table streaks (
  user_id      uuid primary key references profiles on delete cascade,
  current      integer not null default 0,
  longest      integer not null default 0,
  freezes_left integer not null default 1, -- "never miss twice" (D8)
  last_active  date
);

create table reactions (                   -- CET-18
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references profiles on delete cascade,
  to_user_id   uuid not null references profiles on delete cascade,
  group_id     uuid not null references groups on delete cascade,
  kind         text not null check (kind in ('dua','heart','fire','mashaAllah')),
  date         date not null,
  unique (from_user_id, to_user_id, kind, date)  -- tap again to undo
);

create table push_subscriptions (          -- v1.1 (CET-10/D10)
  user_id  uuid not null references profiles on delete cascade,
  endpoint text not null,
  keys     jsonb not null,
  primary key (user_id, endpoint)
);

-- D27: moderation queue + tamper-evident audit trail.
create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles on delete set null,
  group_id    uuid references groups on delete cascade,
  target      text,                        -- free-form: what's being reported
  reason      text not null,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);

-- D27/D29: every super-admin action AND every proxy-log edit lands here.
create table audit_log (
  id       uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles on delete set null,
  action   text not null,                  -- e.g. 'proxy_log', 'reassign_owner', 'resolve_report'
  target   text,
  at       timestamptz not null default now()
);
```

**No table for the derived views.** Consistency, heatmap, the admin fortnight
breakdown, the leaderboard, garden stage, badges, and the pair goal are all
_computed from `logs` vs `tasks.target_count`_ — exactly as the selectors do
today (PRD §6). At scale, optionally precompute a `daily_completion`
materialized view `(user_id, group_id, date, pct)`; not needed for v1.

---

## 4. Row-Level Security (the part that's easy to get wrong)

RLS on **every** table. Use `SECURITY DEFINER` helper functions so policies don't
recurse on `memberships` (the standard Supabase pattern):

```sql
create or replace function is_group_member(g uuid) returns boolean
  language sql security definer stable as $$
  select exists (select 1 from memberships m
                 where m.group_id = g and m.user_id = auth.uid());
$$;

-- "Can manage" = owner OR co-admin (D26 — both hold full management authority).
create or replace function is_group_admin(g uuid) returns boolean
  language sql security definer stable as $$
  select exists (select 1 from memberships m
                 where m.group_id = g and m.user_id = auth.uid()
                   and m.role in ('owner','admin'));
$$;

-- Owner-only powers: delete group + transfer ownership (D26).
create or replace function is_group_owner(g uuid) returns boolean
  language sql security definer stable as $$
  select exists (select 1 from groups gr
                 where gr.id = g and gr.created_by = auth.uid());
$$;

-- D27: the out-of-band recovery/moderation flag (set only in Supabase).
create or replace function is_super_admin() returns boolean
  language sql security definer stable as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false);
$$;
```

> **Note:** `is_super_admin()` is **not** a god-view. It gates only **recovery**
> (reassign a dead group's owner) + **moderation** (act on `reports`) — it does
> **not** grant read access to group content, so D26's privacy promise holds.

| Table         | Read                                                                                 | Write                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`    | self + anyone sharing a group                                                        | update self (`is_super_admin` is **not** self-writable — set in Supabase only)                                                                                               |
| `groups`      | `is_group_member(id)`                                                                | insert: authenticated; update: `is_group_admin(id)`; **delete / transfer (`created_by`): `is_group_owner(id)`**; super-admin may reassign `created_by` (recovery)            |
| `memberships` | `is_group_member(group_id)`                                                          | `is_group_admin(group_id)` (last-admin / self / owner-row guards from the mock); **succession**: a co-admin may claim ownership when the owner is dormant ≥14d or gone (D27) |
| `tasks`       | `is_group_member(group_id)`                                                          | `is_group_admin(group_id)`                                                                                                                                                   |
| `logs`        | `is_group_member(group_id of task)` — peers' logs power the live counter + oversight | self (`user_id = auth.uid()`) **OR** `is_group_admin(group_id of task)` — D29 proxy-logging (sets `logged_by`, writes an `audit_log` row)                                    |
| `invites`     | `is_group_admin(group_id)`                                                           | `is_group_admin(group_id)` (owner or co-admin re-shares; D26)                                                                                                                |
| `reminders`   | self                                                                                 | self only (`user_id = auth.uid()`)                                                                                                                                           |
| `streaks`     | self + `is_group_admin` of a shared group                                            | self (or the scheduled job, service role)                                                                                                                                    |
| `reactions`   | `is_group_member(group_id)`                                                          | insert/delete where `from_user_id = auth.uid()`                                                                                                                              |
| `reports`     | reporter + `is_super_admin()`                                                        | insert: any member; resolve/dismiss: `is_super_admin()` (D27)                                                                                                                |
| `audit_log`   | `is_super_admin()`                                                                   | append-only (service role / the proxy-log + super-admin actions)                                                                                                             |

> The mock's `removeMember`/`setMemberRole`/`transferOwnership`/`claimOwnership`
> already encode the guards (never remove/demote the owner; one owner per group;
> succession only when the owner is dormant/gone) — re-implement those as Server
> Action checks **and** as a DB trigger/policy so they hold even if a client
> misbehaves.

---

## 5. Selector → query mapping

Every `sel.*` becomes a query (in a Server Component or a `lib/queries/*` helper).
Shapes stay the same so components barely change.

| Mock selector                            | Becomes                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `currentUser`                            | `auth.getUser()` + `profiles` row                                                    |
| `activeGroup` / `userGroups`             | `memberships` join `groups` for `auth.uid()`                                         |
| `myGroups` / `sharedWithMe`              | `userGroups` filtered by `role = 'owner'` / `role = 'admin'` (D26 Groups home)       |
| `groupOwner` / `canManageGroup`          | `groups.created_by` join `profiles` / `is_group_admin(group_id)`                     |
| `isOwnerDormant`                         | owner gone from `memberships`, or no owner `logs` in ≥14 days (D27 succession)       |
| `pendingInvitesFor` / `nonMembers`       | `select … from invites where group_id = …` / members not in the group                |
| `groupTasks`                             | `select * from tasks where group_id = … order by sort_order`                         |
| `groupMembers`                           | `memberships` join `profiles`                                                        |
| `countOn`                                | `select count from logs where user/task/date`                                        |
| `groupToday` (live counter)              | `select sum(count) … where task in group and date = today`                           |
| `leaderboard`                            | grouped aggregate over `logs` for the last 7 days                                    |
| `dayCompletion` / `consistency`          | `logs` vs `tasks.target_count` over a date range (one query, grouped)                |
| `taskBreakdown` (admin fortnight)        | `logs` range scan: one member × group tasks × 14 days; cells carry `logged_by` (D29) |
| `memberConsistency` / `groupConsistency` | aggregate the above across members                                                   |
| `remindersFor`                           | `reminders` left-join `tasks` for the user (D30; default off where no row)           |
| `gardenStage`                            | `groupConsistency(30)` + today's pct (same formula, server-side)                     |
| `badges` / `buddy` / `pairGoal`          | pure derivations — keep as TS over fetched rows, or a Postgres function              |

Heavy aggregates (consistency, garden, leaderboard) are good candidates for
**Postgres functions / RPC** (`supabase.rpc('group_consistency', …)`) so the math
lives next to the data and RLS still applies.

---

## 6. Action → Server Action mapping

```ts
// app/(app)/count/[taskId]/actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function increment(taskId: string, by: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const today = new Date().toISOString().slice(0, 10);
  // upsert on the (user_id, task_id, date) unique constraint
  await supabase.rpc("increment_log", {
    p_task: taskId,
    p_date: today,
    p_by: by,
  });
  revalidatePath("/today");
}
```

| Reducer action                                                                                               | Server Action / SQL                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `increment`                                                                                                  | `increment_log` RPC (atomic `insert … on conflict … do update set count = count + p_by`)                                |
| `setCount` (D29 proxy edit)                                                                                  | `logs` upsert with `logged_by = auth.uid()` when editing another member + `audit_log` insert (RLS: self or group admin) |
| `logForGroup` (D29 halaqah tally)                                                                            | upsert one task's count for every member of the group, each attributed + audited (RLS: group admin)                     |
| `addTask`/`editTask`/`removeTask`                                                                            | `tasks` insert/update/delete (RLS: group admin)                                                                         |
| `inviteByEmail`/`acceptInvite`                                                                               | `invites` insert (group admin) → on accept, create `membership` + delete the invite (D26)                               |
| `addUserToGroup`/`removeMember`/`setMemberRole`                                                              | `memberships` writes + guards (never the owner row; last-admin / self guards)                                           |
| `transferOwnership`                                                                                          | set `groups.created_by` + swap owner/admin rows (RLS: `is_group_owner`)                                                 |
| `claimOwnership` (D27 succession)                                                                            | co-admin sets `created_by` to self when owner dormant ≥14d / gone + `audit_log` insert                                  |
| `createGroup`/`renameGroup`/`deleteGroup`                                                                    | `groups` writes; create also inserts the owner `membership` (cascade handles tasks/logs)                                |
| `setReminderTime`/`toggleReminder` (D30)                                                                     | `reminders` upsert for `auth.uid()` (self only)                                                                         |
| `sendReaction`                                                                                               | `reactions` insert/delete (toggle)                                                                                      |
| `fastForwardDay`, `setCurrentUser` (persona), `toggleRibbon`, `toggleOwnerDormant`, `setFreshStart`, `reset` | **demo-only — deleted.** Real day-rollover is a scheduled job; identity/role come from auth                             |

For snappy taps, wrap `increment` in **`useOptimistic`** on the client leaf so the
ring fills instantly, then reconcile with the server result.

---

## 7. Auth (CET-3) + the client/server plumbing

Use **`@supabase/ssr`** (cookie-based sessions, the App-Router-correct choice):

```
lib/supabase/server.ts     // createServerClient(cookies) — for Server Components/Actions
lib/supabase/client.ts     // createBrowserClient — for client leaves (realtime)
middleware.ts              // refresh session + gate (app) routes → redirect to "/"
app/auth/callback/route.ts // OAuth/magic-link code exchange (Route Handler)
```

- **Login** (`app/page.tsx`): real `supabase.auth.signInWithOAuth({ provider: 'google' })` + `signInWithOtp({ email })` (D4) — replaces the faked buttons.
- **Gating**: `middleware.ts` checks the session and redirects unauthenticated users hitting `(app)/*` back to `/`. (Replaces "Skip into the demo".)
- **Roles**: the demo "act as" persona switch is gone; the real role is read from `memberships.role` (`owner`/`admin`/`member`, D26) for the active group — there is **no** app-admin flag. Manage UI (member breakdown, manage gear, share, proxy-log) keys off `is_group_admin`; delete/transfer key off `is_group_owner`. The `is_super_admin` flag is backend-only (recovery + moderation), never surfaced as in-app role UI.

---

## 8. Realtime (CET-7)

Replace the `setInterval` peer-nudger with a Supabase Realtime subscription in a
small client leaf inside the Group/Today live counter:

```ts
"use client";
const supabase = createBrowserClient(...);
useEffect(() => {
  const ch = supabase.channel(`logs:${groupId}`)
    .on("postgres_changes",
        { event: "*", schema: "public", table: "logs", filter: `group_id=eq.${groupId}` },
        () => router.refresh())   // or patch local state for a smoother tick
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}, [groupId]);
```

(Enable Realtime on `logs`; note RLS applies to realtime too.)

---

## 9. Incremental order (strangler, mapped to Linear)

Don't big-bang it. Migrate the data layer under one screen at a time, mock still
serving the rest, until the mock is unused — then delete it.

1. **CET-2 — foundation.** `pnpm add @supabase/ssr @supabase/supabase-js`; create the SQL above + RLS in a migration; seed; `supabase gen types typescript` → `lib/database.types.ts`; add the two clients + middleware.
2. **CET-3 — auth.** Real login + callback + route gating + `profiles` row on signup (DB trigger).
3. **Read path, screen by screen.** Convert `/today` to a Server Component fetching its own data; then `/group`, `/progress`, `/admin`. Each: delete its `"use client"`, push interactivity to leaves.
4. **CET-6 — writes.** Server Actions for `increment` (+ optimistic tap) and the task/member/group mutations.
5. **CET-7 — realtime** live counter. **CET-8 — streaks** job. **CET-9** leaderboard query. **CET-16** consistency/breakdown queries (already designed as bounded scans).
6. **Delete `lib/mock/*`** and the Demo Controls once nothing imports them.

---

## 10. What does NOT change

- **Routing**: file-based App Router, route groups, `[taskId]`, the redirects — untouched.
- **`app/(app)/layout.tsx`**: stays the shell; `MockStateProvider` is removed (Server Components fetch directly), `CelebrationProvider` + frame remain.
- **UI**: `components/ui/*`, the design-token contract, `globals.css`, the dialog/portal work — all unchanged.
- **Feature components**: most keep their markup; only their data prop source changes (a server parent passes fetched data down, or a small client leaf subscribes).

---

## 11. Gotchas / decisions to make before starting

- **Type generation, not hand-rolling.** Generate `database.types.ts` from the schema so app types can't drift from the DB. The mock `types.ts` becomes the _target spec_, then is retired.
- **RLS recursion.** Always go through the `SECURITY DEFINER` helpers; never write a `memberships` policy that selects `memberships`.
- **`logs` read scope.** The collective counter needs peers' logs — decide group-wide `SELECT` on logs (chosen above) vs. exposing only an aggregate RPC. Group-wide read is simpler and matches the mock; revisit if privacy needs tighten.
- **Streak / never-miss-twice** must run server-side on a schedule (Vercel cron or `pg_cron`), not on a client "fast-forward". Define the exact rollover time (per-user timezone? group timezone? UTC for v1).
- **Optimistic writes** for the tap counter, or the dopamine loop feels laggy (`useOptimistic` + Server Action).
- **Invite codes**: move `makeInviteCode` to the DB (default + unique retry) or a Server Action; don't generate on the client.
- **Tests arrive here.** The pure selectors → port their logic into Postgres functions with SQL tests, and add a Vitest suite on any TS-side derivations + a Playwright e2e on the core loop (the one real gap vs. industry norms).

---

## 12. One-paragraph summary

The mock was built as a faithful stand-in: types mirror the schema, reads are pure
selectors, writes are discrete actions, realtime is a ticker. Migration =
(1) create the Postgres tables + RLS from §3/§4, (2) move reads into Server
Components as queries (§5), (3) turn actions into Server Actions (§6), (4) wire
auth (§7) and realtime (§8), (5) do it screen-by-screen (§9), then delete
`lib/mock/*`. The UI, tokens, and routing ride along unchanged. The only genuinely
new architectural muscle is **server-first rendering** (don't carry the
client-Context shape forward) and **RLS** — both standard, both planned here.
