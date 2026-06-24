# Cetele — Product Requirements (v1)

> **One line:** A group dhikr tracker that makes daily remembrance _addictive_ — built around the traditional **cetele** (a shared tally where a group splits and completes a collective dhikr goal together).

---

## 1. The bet

People don't quit dhikr because they don't want to — they quit because **nothing pulls them back daily**. Cetele combines two forces:

| Layer                            | What it does                                                                  | Why it works                                     |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| 🔥 **Dopamine (the hook)**       | Tap counter, progress rings, streaks, live group counter, surprise milestones | Gets people opening the app every day            |
| 🤝 **Accountability (the glue)** | Real groups, visible peers, leaderboard, forgiveness                          | Stops the "streak broke → quit forever" collapse |

> Dhikr is _repetitive habit-maintenance_, not skill mastery — the exact use case where gamification works. We lean in, but anchor it in real group accountability so it lasts.

---

## 2. Users & roles

Three roles:

| Role            | Scope        | Can do                                                                                                                             |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Member**      | their groups | Join a group, log dhikr, see own streak + group activity & leaderboard                                                             |
| **Group Admin** | one group    | Everything a member can + create/edit that group's **dhikr list & targets**, invite/remove members, promote members to group admin |
| **Admin**       | whole app    | Everything above + create/manage **all** groups, assign group admins, app-level config                                             |

---

## 3. The core loop

```
Open app  →  see group + own progress (rings unfilled, "Day 12 streak")
          →  tap-count dhikr, ring fills, group total ticks up live
          →  hit target → ring closes → confetti / surprise reward
          →  streak +1, climb leaderboard
          →  (later) push notification next day → repeat
```

---

## 4. Features

### ✅ v1 (ship first — "Social v1")

- **Auth** — Google OAuth + email magic link (Supabase Auth)
- **Groups** — create, join via invite link/code, admins manage members
- **Admin-set dhikr list** — admin defines items + daily target counts per group (e.g. _Allahu Akbar ×100_, _Astaghfirullah ×1000_)
- **Tap counter** — tasbih-style: tap to count, haptics + subtle sound, number animation
- **Progress rings** — Apple-Watch-style ring per item, fills toward target, closes on completion
- **Live collective counter** — real-time group total ("41,300 / 100,000 today") via Supabase Realtime
- **Streaks** — personal daily streak; **"never miss twice"** forgiveness (1 streak-freeze)
- **Group leaderboard** — rank members by consistency/completion this week
- **Consistency tracker** — the longitudinal view of _how steadfast_ each member is (the in-app surface for our North Star). A GitHub-style **calendar heatmap** of daily completion (green intensity = % of that day's tasks closed) + a headline **consistency score** (% of days fully completed over **7 / 30 / 90 days**) + **longest streak**. Three views:
  - **Personal** — each member sees their own history (self-reflection, identity reinforcement)
  - **Group-admin oversight** — group admins see every member's consistency, to spot who's slipping and follow up (real accountability)
  - **Group collective rollup** — the group's 90-day consistency figure, shown to the whole group (the North Star, made visible)
  - _Distinct from streaks (current momentum) and the leaderboard (this-week ranking): this is the **pattern over time**. Derived from `logs` vs targets — no streak/FOMO pressure, framed by **forgiveness** (a single missed day is a lighter cell, never an alarm)._
- **Variable-reward milestones** — occasional surprise animation / du'a at random milestones

### 🔜 v1.1 (fast-follow)

- **Push notifications** — daily nudges via **Web Push + service worker** (VAPID keys), sent from a Vercel cron / Supabase Edge Function. Works on Android & desktop; iOS only on 16.4+ as an installed PWA
- **Email reminders** — reliable fallback (Supabase/Resend) for users who don't install or are on older iOS
- Habit-stacking reminders ("After Fajr…")

### 💡 Later / maybe

- Multiple groups per user · weekly group goals · history/stats charts · ramadan mode · audio dhikr

---

## 5. Retention mechanics (where each lever lives)

| Lever               | Source         | Implementation                                                                 |
| ------------------- | -------------- | ------------------------------------------------------------------------------ |
| Completion drive    | dopamine       | Progress rings + confetti                                                      |
| Variable reward     | dopamine       | Surprise milestone reveals                                                     |
| Social proof        | accountability | Live group counter + leaderboard                                               |
| Identity            | durable        | "You're someone who does dhikr daily" framing                                  |
| Steadfastness       | durable        | **Consistency tracker** — heatmap + 7/30/90-day score (personal, admin, group) |
| Forgiveness         | durable        | Never-miss-twice + streak freeze                                               |
| Real accountability | durable        | Visible group peers (the _cetele_ itself)                                      |

---

## 6. Data model (sketch)

- **users** — id, name, avatar, `is_admin` (app-level admin flag) (Supabase Auth)
- **groups** — id, name, invite_code, created_by
- **memberships** — user_id, group_id, role (`member` | `group_admin`)
- **dhikr_items** — id, group_id, label, arabic, target_count, order
- **logs** — id, user_id, dhikr_item_id, count, date
- **streaks** — user_id, current, longest, freezes_left, last_active
- **push_subscriptions** — user_id, endpoint, keys (for Web Push; see §4 v1.1)

> Row-Level Security on every table: members read their group, admins write their group.

**Consistency tracker** needs **no new table** — it is derived from `logs` (count per user / item / date) vs each item's `target_count`: a day's completion % = closed-rings ÷ total-tasks; the 7/30/90-day score = % of days fully completed; the group rollup aggregates across members. For performance at scale, optionally precompute a `daily_completion` view/materialized view (user_id, group_id, date, pct). RLS mirrors the rest: members read their own + group rollups; group admins read all members in their group.

---

## 7. Tech stack

| Concern                        | Choice                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| Framework                      | **Next.js (App Router) + React + TypeScript**                       |
| UI                             | Tailwind + shadcn/ui                                                |
| Backend / DB / Auth / Realtime | **Supabase** (Postgres, Auth, Realtime)                             |
| Hosting                        | **Vercel**                                                          |
| Delivery                       | **Installable PWA** (no app store — works on any phone via browser) |
| Tracking                       | **Linear** (team `CET`)                                             |

---

## 8. Explicitly out of scope (v1)

Native iOS/Android apps · payments · multiple languages · in-app messaging/chat · web-only desktop-first design (we are **mobile-first**).

---

## 9. Success = retention, not signups

| Metric                    | Target                                |
| ------------------------- | ------------------------------------- |
| **D7 retention**          | members active 7 days after joining   |
| **Daily completion rate** | % of members closing all rings        |
| **Streak survival**       | % keeping a 14-day+ streak            |
| **Group liveness**        | groups with daily collective activity |

> North star: **70%+ consistency** across a group over 90 days — showing up, not perfection.

The **consistency tracker** (§4) is the in-app surface for these metrics — what's measured for success is also what members and admins see, so the product and the goal stay aligned.
