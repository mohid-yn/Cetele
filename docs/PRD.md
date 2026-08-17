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

**Drive-style group ownership (D26).** There is **no app-level admin tier**.
Anyone can create a group and becomes its **owner**; groups are **private by
default** and visible only to people in them. An owner can **share** a group
with others as a **co-admin**, and can **transfer ownership**. Roles are
**per-group** (a person can be owner of one circle, co-admin of another, member
of a third):

| Role                   | Scope     | Can do                                                                                                                                                                                                                                |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member**             | one group | Log tasks, see own streak + the group's activity, leaderboard & garden                                                                                                                                                                |
| **Co-admin** (`admin`) | one group | Everything a member can + edit the group's **task list & targets**, invite/remove members, promote members, **re-share** the group, and **log counts on a member's behalf** (attributed + audited — the in-person halaqah tally; D29) |
| **Owner**              | one group | Everything a co-admin can + **delete the group** and **transfer ownership** (one owner per group; the creator, until transferred)                                                                                                     |

There is no global "see every group" view — access is bounded entirely by
ownership and sharing.

**Succession (D27).** So a single owner leaving never orphans a circle, a
**co-admin can claim ownership** of a group whose owner is **dormant** (no
activity ≥ 14 days) or gone. Forgiveness-framed, not a power grab.

**Super-admin / "organiser" (D27, widened by D56).** One out-of-band role exists
for maintainability + safety: `profiles.is_super_admin`. Its powers are
**recovery** (reassign a dead group's owner), **moderation** (act on abuse
reports) and — since the programme shipped — **authoring the administration's
roadmap** (§4). It is **not** a browse-all-content god view, so the privacy
promise above holds; every super-admin action is written to an `audit_log`. **The
first organiser is granted by hand in Supabase**; after that an organiser may
appoint another **in the app**, and stand them down. There is no self-escalation
path at any point, and no in-app bootstrap — so a project with no organiser needs
someone with database access, by design (hand the flag to a successor in
Supabase).

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
- **Per-member shares** — the circle's goal is **split** between its members, and an admin may ask **more** of one of them than the circle's default, per task (D61). A cetele is a shared goal divided among people and the division is not always equal: somebody who can carry 500 takes 500. Unlike a stretch goal this is an **obligation** — it is what "done" means for that member, what their streak is judged at, and what the circle counts on them for, so the collective goal is the **sum** of each carrier's share rather than target × members. Raise-only, and a past day is always judged by the share in force **that** day, so raising somebody today can never un-keep a day they already kept. Lowering a member below the circle's number is deliberately not offered
- **Personal stretch goals** — a member may raise their **own** daily bar above **their** share, per task (D51). Raise-only: their share is the floor, so nobody can quietly owe the group less, and an admin raising the target or their share above someone's goal simply wins. It changes only what that member **aims** at — the ring and the celebration. Everything shared or judged (day-completion, streak, consistency, steadfastness, the garden, the circle's collective goal) still counts from their **share**, so aiming higher can only ever add
- **One act, many circles** — a member in three circles that all ask for salawat does the dhikr **once**; the app lets them say so, and one tap then counts in all of them (D64, refined by D66/D67). A **link** is the member's own claim that circle A's task and circle B's task are the same act — never inferred, never automatic. It **fans out on write**: tapping records the same raw number against each linked task, so each circle goes on judging its own task by its own target and its own share. The **raw count travels, the completion does not** — circle A asking 1 and circle B asking 500 means logging 1 makes the day in A and leaves B at 1-of-500, which is true. Clusters, not pairs (up to 10 tasks), so three circles need no chain of links; two tasks in the **same** circle can never be linked, because that would count one act twice in that circle's own total. The link is **private to the member** — an admin cannot declare it — and offered on each task's row in "My goals", where every cross-circle task is listed and similar names only sort the list. **Leaving a circle makes a link dormant, not deleted**: nothing is counted there while you are out, the member can clear it themselves, and it revives if they rejoin
- **Tap counter** — tasbih-style: tap to count, haptics + subtle sound, number animation
- **Progress rings** — Apple-Watch-style ring per item, fills toward target, closes on completion
- **Live collective counter** — real-time group total ("41,300 / 100,000 today") via Supabase Realtime
- **Streaks** — personal daily streak; **"never miss twice"** forgiveness (1 streak-freeze that **re-arms after every kept day** — a single missed day is always forgiven if you come back; two in a row reset)
- **Group leaderboard** — rank members by consistency/completion this week
- **Consistency tracker** — the longitudinal view of _how steadfast_ each member is (the in-app surface for our North Star). A **14-day task-by-task grid** (each task × day, green intensity = % of that day's target hit) + a headline **30-day consistency band** (a calm word + %, abstracted — _"Steady · 83%"_ — not a raw 7/30/90 grade; D28) + **longest streak**. Three views:
  - **Personal** — each member sees their own history (self-reflection, identity reinforcement); they can also **correct their own past counts** in the grid (D29)
  - **Group-admin oversight** _(lives under Group → Members, not the personal Progress tab)_ — group admins see every member's **recent consistency** (the **Steadfastness** rate, D31), to spot who's slipping and follow up (real accountability). Tapping a member opens a **per-task fortnight breakdown** (each task × the last 14 days, with the exact count vs target per day) so an admin can ask about _specific days_ ("you missed Salawat Tue–Thu — everything ok?"). Forgiveness-framed (a missed day is a calm neutral cell, never a red alarm). Admins may also **log on the member's behalf** from this grid — every proxy entry is **attributed** ("logged by …") and **audited** (D29); plus a **"log for the group"** quick action marks a task done for the whole circle (the in-person halaqah)
  - **Group collective rollup** — the group's 90-day consistency figure, shown to the whole group (the North Star, made visible)
  - **Steadfastness recognition** _(admin-only, optional; backend-era; D31)_ — an owner/admin-only view ranking members by **recent consistency** — _average daily completion % over a **sliding** 90-day window_ (a **rate**, never cumulative volume or tenure; partial credit per day; ≥14 logged days to qualify) — so a group can recognise/reward its most steadfast members. Eligibility is a **bar** (e.g. ≥85%), not a single winner; **private to admins** (no member-facing board → no riya'); any reward happens **outside the app**. Deliberately **rejects** XP / levels / cumulative points (rich-get-richer + riya'; D28). Derived from the daily-completion rollup — no stored score.
  - _Distinct from streaks (current momentum) and the leaderboard (this-week ranking): this is the **pattern over time**. Derived from `logs` vs targets — no streak/FOMO pressure, framed by **forgiveness** (a single missed day is a lighter cell, never an alarm)._
- **Variable-reward milestones** — occasional surprise animation / du'a at random milestones

### ✅ The annual programme — "roadmap" (D55–D59, live)

A halaqah's year does not fit in a daily tally. An **administration** publishes a **programme** — the booklet
made live — and a circle follows it alongside its daily dhikr. The two never touch: a programme item is ticked
off, it is not counted, so nothing here reaches `logs`, streaks, rings or the collective goal.

- **A programme is levels × categories × items.** An item is a book to read, a khatm target, a surah range, a
  tajweed text or a lecture with a minute budget and a link to watch it — each with its own unit, target and
  cover image, and each either compulsory or chosen. A **level requirement** sets the minimum a member must
  total in a category to clear that level, so a level is a bar rather than a checklist
- **A circle opts in from Manage, and may follow several programmes at once** (D58) — a yearly programme and a
  Ramadan one need not be two circles. Progress is keyed on the **member and the item**, so following a second
  programme adds work rather than splitting what is already recorded
- **Rewards are informational and out-of-app** (D31's shape): a threshold and a wording an organiser can
  correct on a live programme (D60). The app never handles fulfilment
- **The organiser role authors it in-app** — create a programme, add and edit items, publish, appoint another
  organiser. The **first** organiser is still set by hand in Supabase; there is deliberately no in-app bootstrap
- **An organiser reads the cohort, not just their own circle**: a progress report per programme, across every
  circle following it

### 🔜 v1.1 (fast-follow)

- **Push notifications** — daily nudges via **Web Push + service worker** (VAPID keys), sent from a Vercel cron / Supabase Edge Function. Works on Android & desktop; iOS only on 16.4+ as an installed PWA
- **Email reminders** — reliable fallback (Supabase/Resend) for users who don't install or are on older iOS
- **Custom daily reminders (D30, reshaped by D62)** — each member writes their own reminders: a **name they choose and a time they pick**, as many as they want, not a fixed prayer anchor — _flexibility over rigid habit-stacking_. A reminder belongs to the **member**, not to a task or a circle, so someone in three circles has as many reminders as they decided to have rather than one per task. It is a **clock, not a judge**: it fires at its time whether or not the member has already finished, because a standalone reminder has nothing to measure. The in-app timing UI ships now; delivery rides the Web Push / email above. **Prayer-time quick-fill presets** can layer on later as an optional shortcut.

### 🌱 v2 — retention deepening (research-backed)

> From [`research/03-feature-recommendations.md`](../research/03-feature-recommendations.md), which links the motivation science (`research/02`) to the competitive gaps (`research/01`). Ordered by impact ÷ effort. **Two already-scoped items are the research's _top_ priority — promote them:** variable-reward milestones (strongest dopamine lever, v1) and reminders + habit-stacking (the missing trigger, v1.1).

- **Group garden (collective living artefact)** — a shared garden per circle that **grows as the group completes its rings** and goes calmly dormant (never shaming) when activity drops. The emotional/identity layer Cetele lacks — built on the **group**, not a solo avatar, so it reinforces accountability; _jannah_/garden imagery suits a worship app. Optional personal "your corner" plant feeds the shared garden. _Levers: ownership + relatedness; precedent: Finch / Forest._
- **One-tap peer reactions** — send a quick **dua / "barakAllahu feek" / ❤️** when a peer closes their rings. Near-zero-effort relatedness spark. _Precedent: Strava kudos._
- **Fresh-start re-engagement** — re-invite lapsed members on temporal landmarks (**Hijri new month, Ramadan, week start**) with a clean-slate framing. _Lever: fresh-start effect._
- **Achievement badges** — streak landmarks (7 / 30 / 100 days) + monthly awards; earned and escalating, never saturating. _Precedent: Apple Fitness awards._
- **Endowed-progress onboarding** — new members/groups start visibly **"part-way"** (a pre-filled first contribution, the group goal already moving) so day one feels like momentum, not a cold start. _Lever: endowed-progress effect._
- **Winnable sub-group / pair goals** — shared goals for two friends or a sub-group instead of one whole-group ranking, keeping competition **winnable** and intrinsic.

### 💡 Later / maybe

- Weekly group goals · history/stats charts · ramadan mode · audio dhikr · levels/XP · avatar & theme customisation

> **Multiple groups per user shipped** and is now load-bearing rather than a maybe: a member switches circles
> from Today, carries a separate share and stretch goal in each, and links one act across them (§4). A streak
> still spans **all** of a member's circles.

---

## 5. Retention mechanics (where each lever lives)

| Lever               | Source         | Implementation                                                                                                                             |
| ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Completion drive    | dopamine       | Progress rings + confetti                                                                                                                  |
| Variable reward     | dopamine       | Surprise milestone reveals                                                                                                                 |
| Social proof        | accountability | Live group counter + leaderboard                                                                                                           |
| Identity            | durable        | "You're someone who does dhikr daily" framing                                                                                              |
| Steadfastness       | durable        | **Consistency tracker** — 14-day grid + 30-day band (personal/admin) + 90-day group rollup                                                 |
| Forgiveness         | durable        | Never-miss-twice + streak freeze                                                                                                           |
| Real accountability | durable        | Visible group peers (the _cetele_ itself)                                                                                                  |
| Trigger             | dopamine       | _(v1.1)_ Daily reminders — member-named, member-timed, as many as they want (D30/D62)                                                      |
| Ownership           | durable        | _(v2)_ Group garden — a collective artefact that grows with the group                                                                      |
| Peer encouragement  | accountability | _(v2)_ One-tap dua / kudos reactions on a peer's completion                                                                                |
| Re-engagement       | durable        | _(v2)_ Fresh-start prompts (Hijri new month, Ramadan, week start)                                                                          |
| Recognition         | accountability | _(admin-only, backend-era)_ Steadfastness view — recent-consistency **rate** (sliding 90-day avg), for an optional out-of-app reward (D31) |

---

## 6. Data model (sketch)

- **profiles** — id, name, avatar_url, timezone (each member's day closes at their own midnight — D34), mirroring `auth.users` (Supabase Auth). No app-level admin flag; one out-of-band `is_super_admin` (D27/D56 — the first granted only in Supabase, thereafter organiser-to-organiser in-app; recovery + moderation + authoring the programme)
- **groups** — id, name, `created_by` = **the owner** (authoritative; updated on transfer / succession). No group-level invite code — joining goes through `invites` only (D35)
- **memberships** — user_id, group_id, role (`owner` | `admin` | `member`); exactly one `owner` row per group
- **invites** — id, group*id, email (optional — locks the invite to a verified sign-in email, enforced without sending anything), role (`admin` | `member`), code (DB-generated) — **shareable link/code invites** (`/join/<code>`; admin shares the link themselves; accept → a membership). **Open invites (no email) are reusable until revoked** — one link serves a whole halaqah; **email-locked invites are single-use** (deleted on accept) (D35). Email \_delivery* of invites = later nice-to-have (needs Resend + a domain)
- **tasks** — id, group_id, label, subtitle, target_count, sort_order, `frequency_days` (a cycle: daily, or every N days)
- **task_assignments** — id, task_id, user_id, `assigned_at`/`unassigned_at` — which members carry a task, as **intervals**. A task with no assignment rows is everyone's; unassigning closes a row rather than deleting it, so a past day still knows who owed it
- **task_config_versions** — id, task_id, target_count, frequency_days, `effective_from`/`effective_to` — the task's target and cycle **over time**. A past day is judged by the configuration that day had, so an admin raising a target today can never un-keep a day already kept
- **member_task_shares** — task_id, user_id, target_count, effective_from/to — what the circle asks of **one member** for one task, over time (D61). One row per interval, never deleted: a change closes one and opens the next, so `private.obligations` judges a past day by the share in force that day. Readable by the whole circle (the split is not a secret — the collective goal is its sum), written only through `set_member_task_share` (admin-only). Applied everywhere as `greatest(share, tasks.target_count)`, so a later circle-wide raise still wins
- **member_task_goals** — user_id, task_id, target_count — a member's optional **raised** bar for one task (D51). Private to its owner (own-row RLS: not peers, not admins), written only through `set_task_goal`, and applied everywhere as `greatest(their share, override)` so it can never lower what the circle asked. Read by the member's own rings; deliberately **not** by day-completion, the rollup, or any collective figure — nor, since D62, by the reminder dispatcher, which no longer knows about tasks at all
- **member_task_links** — user_id, task_id, cluster_id — the member's claim that tasks in **different** circles are one act (D64). A cluster, not a pair: every task sharing a `cluster_id` is the same act, up to 10. Private to its owner (own-row RLS — an admin cannot link on your behalf), written only through `link_tasks` / `unlink_task`, which refuse two tasks in one circle. Counting **fans out on write** (a second `logs` row per linked task, the same raw delta), so no reader anywhere else changes. The row survives leaving a circle — the fan-out simply skips a circle you are no longer in
- **logs** — id, user_id, task_id, count, date, `logged_by` (nullable — the admin who logged it on the member's behalf; null = self; D29)
- **reminders** — user_id, label, time (`HH:MM`), enabled — the member's **own** reminders (D62): a name they wrote and a time they picked, capped at 20 per account. Points at no task and belongs to no circle, so it survives leaving one and needs no membership to exist. Private to its owner (own-row RLS), written only through `set_reminder`; `last_sent_on` is the dispatcher's alone, so no client can re-arm a send
- **streaks** — user_id, current, longest, freezes_left, last_active
- **daily_completion** _(rollup)_ — user_id, group_id, date, completion% — **one small row per member per day**, kept **90 days**; powers the 30-day band, the 90-day rollup, and the **steadfastness** metric (D31). Lets raw `logs` be pruned at **14 days** (amends D28)
- **reactions** — id, from_user_id, to_user_id, group_id, kind, date — one-tap peer encouragement (§4 v2), one per sender/receiver/kind/day
- **badges** / **badge_awards** — the catalogue (glyph, label, kind, threshold, window) and what each member has **earned** (user_id, group_id, badge_id, earned_on). Append-only and granted to nobody for INSERT: an earned badge is permanent, never re-derived from a live window and never revoked on a dip
- **roadmaps** / **roadmap_items** / **roadmap_level_requirements** / **roadmap_rewards** — the programme (§4): a named year with a window and a `published` flag; its items (level, category, title, source, url, unit, target, compulsory, cover image); the minimum total a level asks for in a category; and the reward wording at each threshold
- **group_roadmaps** — group_id, roadmap_id — which circles follow which programmes. A **row**, not a column, so a circle can follow several at once (D58) and next year's enrolment need not destroy this year's
- **roadmap_progress** — user_id, item_id, done — keyed on the **member and the item**, never on the circle, so following a second programme adds work rather than partitioning what is recorded. Survives leaving a circle, like a link does
- **push_subscriptions** — user_id, endpoint, keys (for Web Push; see §4 v1.1)
- **reports** — id, reporter_id, group_id/target, reason, status (D27 moderation queue)
- **audit_log** — id, actor_id, action, target, at — every super-admin action is recorded (D27)

> Row-Level Security on every table (D26 ownership): a row is visible only to people in that group (owner / co-admin / member); **writes** to group config (tasks, memberships, settings) require `owner` or `admin`; **delete group** and **transfer ownership** require `owner`. **Succession (D27):** a co-admin may claim ownership when the owner is dormant (no activity ≥ 14 days) or gone. **Super-admin (D27):** the only path that bypasses ownership — limited to recovery (reassign a dead group's owner) + moderation; no read access to group content; every action audited.

**Consistency tracker** is derived from `logs` (count per user / item / date) vs each item's `target_count`: a day's completion % = closed-rings ÷ total-tasks; the **30-day band** (personal/admin) = % of the last 30 days fully completed, the **90-day rollup** aggregates across members (the North Star). _(7-day and personal 90-day windows were dropped — D28.)_ The admin proxy-logging (D29) writes `logs.logged_by`; an `audit_log` row backs each proxy edit. RLS mirrors the rest: members read their own + group rollups; group admins read all members in their group. The **admin per-task fortnight breakdown** (§4) is a bounded `logs` range scan (one member × group tasks × last 14 days).

**Retention split (D31, amends D28).** Two layers, so longitudinal views are cheap without hoarding raw counts:

- **Raw `logs` → 14 days.** They carry exact per-task counts and feed only short-window reads: today's live counter + rings, the 7-day leaderboard, and the **14-day editable grid** (incl. D29 proxy-edits / self-correct). So raw retention = the editable-grid window; corrections only reach back 14 days.
- **`daily_completion` rollup → 90 days.** One row per member per day (`completion%`), written nightly _before_ raw logs are pruned. Everything longitudinal reads this: the 30-day band, the 90-day group rollup, streaks/badges/garden, and the **steadfastness** metric. `steadfastness = AVG(completion%)` over a member's last 90 rollup rows — a **rate, never a stored cumulative score** (D31). The rollup goes back 3× longer than raw logs yet stores fewer rows (1/day vs one per task/day), so it stays cheap and flat.

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
