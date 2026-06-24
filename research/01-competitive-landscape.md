# Daily-reminder & progress-tracking apps — what they do that Cetele doesn't

A survey of the apps that win at **getting people back daily** and **tracking
progress**, mapped against Cetele's current feature set, to find the gaps worth
closing. Researched 2026-06-25. Read alongside `docs/UI_PRACTICES.md` and
`research/02-motivation-and-reward-design.md` (the _why_ behind these mechanics).

> **How to read this:** each app section ends with **"Steal this"** — the
> transferable mechanic. The gap table at the end is the prioritised backlog.
> Cetele's North Star is **70%+ group consistency over 90 days** (PRD §9), so we
> judge every mechanic by _does it bring people back and help them finish_, not
> by novelty.

---

## 1. The benchmark apps

### Duolingo — the streak-and-league machine

The reference standard for habit retention. Reduced churn from **47% → 28%** by
layering mechanics that each serve a different point in the user's journey.

| Mechanic                  | What it does                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| **Streak**                | Daily yes/no decision; powered by **loss aversion** (losing hurts ~2× gaining). The flagship hook. |
| **Streak freeze**         | A consumable that saves a missed day — forgiveness so a slip doesn't cause quit.                   |
| **XP + leagues**          | Weekly 10-tier competition (Bronze→Diamond) with **skill-based matchmaking** so it stays winnable. |
| **Friend quests/streaks** | Shared goals with a friend → social accountability.                                                |
| **Smart notifications**   | Personalised reminder timing; famously persistent, escalating copy.                                |
| **Day-one achievements**  | Early wins calibrated so brand-new users feel competent immediately.                               |

**Steal this:** _layered_ motivation (a reason to return at day 1, day 7, week 4,
month 6), **winnable** competition via matchmaking, and the streak-freeze as
forgiveness. Cetele has streaks + freeze; it lacks leagues/divisions, friend-pair
goals, smart reminder timing, and journey-staged early wins.
([StriveCloud](https://www.strivecloud.io/blog/blog-gamification-examples-boost-user-retention-duolingo) ·
[Trophy case study](https://trophy.so/blog/duolingo-gamification-case-study) ·
[Orizon](https://www.orizon.co/blog/duolingos-gamification-secrets))

### Habitica — life as an RPG

Turns tasks into a role-playing game: complete habits → your character levels up,
earns gear/gold, and **parties** with friends to fight bosses. 100+ collectible
pets, all core features free.

**Steal this:** **variable loot** (drops on task completion are a variable-ratio
reward — the strongest dopamine schedule), and **party quests** where a friend
skipping a day visibly weakens the team (peer accountability with teeth). Risk:
"gamification fatigue" — managing the avatar can eclipse the real task.
([Habitica alternatives](https://makeheadway.com/blog/habitica-alternatives/) ·
[apps like Habitica](https://tms-outsource.com/blog/posts/apps-like-habitica/))

### Finch — the self-care pet that never shames you

You raise a bird that grows as you complete self-care actions. **10M+ downloads,
4.9★ from 500k+ reviews.** Crucially: a bad day is fine — the bird is just happy
to see you.

**Steal this:** **a dependent you nurture** (showing up "for someone") and a
**shame-free** stance — exactly Cetele's "never miss twice" ethos. The avatar is
the _embodiment of your progress_, an emotional layer Cetele entirely lacks.
([Habitica alternatives](https://makeheadway.com/blog/habitica-alternatives/))

### Forest — immediate, tangible stakes

Plant a tree at the start of a focus session; leave the app and it dies. Builds a
visible forest over time. Praised for **immediate, low-stakes rewards** that help
overcome executive dysfunction (ADHD community favourite).

**Steal this:** **a growing artefact** that visualises cumulative effort (our
heatmap is a start — a "garden/forest that grows with the group" is the richer
version), and **instant** consequence/reward at the moment of action.
([Best habit apps](https://habi.app/insights/best-habit-tracker-apps/))

### Streaks (iOS) — the minimalist counterpoint

A handful of habits as simple circles. Tap to complete. That's the _entire_
interaction. A reminder that **low friction beats more features** — the lesson
the Muslim-app reviews echo: _"if tracking feels like work, users abandon it."_

**Steal this:** ruthless friction-reduction. Cetele's tap-counter is already in
this spirit; protect it as we add layers. ([Zapier](https://zapier.com/blog/best-habit-tracker-app/))

### Strava / Apple Fitness — social proof & closing rings

Strava's **kudos + segments** turn solo effort into social events; Apple's
**three rings + monthly awards** make "close your rings" a cultural verb.

**Steal this:** the **ring-close as identity** (Cetele has rings — lean harder
into the _close_ moment and monthly award badges), and **lightweight social
reactions** (a "kudos"/dua-reaction on a peer's completion) that cost one tap.

---

## 2. The faith-specific field (our direct neighbours)

A live ecosystem of Muslim consistency apps — and they're already using the
mechanics Cetele is built on, which both validates the thesis and raises the bar.

| App                       | Notable mechanic                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------- |
| **Mizan**                 | Private **groups by code**, see friends' prayer status, a **"Mizan Score"** + streak. |
| **Everyday Muslim**       | Shared groups where family/friends **observe each other's progress** collaboratively. |
| **Salah Streak**          | Turns prayer data into **insights/visualised progress** to sustain motivation.        |
| **SalahLock / Just Pray** | Reminder-first; low-friction logging.                                                 |

**What this tells us:** group accountability + streak + score + insight is
becoming _table stakes_ for this audience. Cetele's defensible edge has to be the
**combination done well** — the _collective cetele_ (a shared goal split across a
real group, not just parallel solo tracking), live group counter, and a
genuinely forgiving, non-shaming tone — plus polish the solo apps lack.
([Best Salah trackers 2026](https://mysalahtracker.app/best-salah-tracking-apps-in-2026-stay-consistent-all-year-round/) ·
[DeenUp guide](https://www.deenup.app/blog/islamic-goal-tracking-apps-guide) ·
[Islamic Lifestyle Apps study](https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2595545))

---

## 3. Gap analysis — what Cetele has vs. what it's missing

Legend: ✅ have · 🟡 partial/planned · ❌ missing.

| Capability                                                       | Best-in-class example           | Cetele today                     | Priority |
| ---------------------------------------------------------------- | ------------------------------- | -------------------------------- | -------- |
| Tap logging, low friction                                        | Streaks                         | ✅ tap counter                   | —        |
| Progress rings / completion drive                                | Apple Fitness                   | ✅ rings (emerald)               | —        |
| Personal streak                                                  | Duolingo                        | ✅ + never-miss-twice freeze     | —        |
| Live collective goal                                             | (unique-ish)                    | ✅ live group counter            | —        |
| Longitudinal consistency view                                    | Salah Streak                    | ✅ heatmap + 7/30/90 (CET-16)    | —        |
| Weekly leaderboard                                               | Strava                          | ✅ (consistency-ranked)          | —        |
| **Daily reminders / notifications**                              | Duolingo, every Salah app       | ❌ (v1.1, not built)             | **High** |
| **Smart reminder timing + habit-stacking** ("after Fajr…")       | Duolingo, Tiny Habits           | ❌                               | **High** |
| **Variable-reward milestones**                                   | Habitica loot                   | 🟡 planned (CET-10), not live    | **High** |
| **Leagues / divisions (winnable competition)**                   | Duolingo                        | ❌                               | Medium   |
| **Friend-pair / sub-group goals**                                | Duolingo quests, Habitica party | ❌ (only whole-group)            | Medium   |
| **Avatar / growing artefact**                                    | Finch, Forest                   | ❌ (heatmap is the only "grows") | Medium   |
| **Badges / achievements / monthly awards**                       | Apple Fitness                   | ❌                               | Medium   |
| **Lightweight peer reactions** (dua/kudos)                       | Strava kudos                    | ❌                               | Medium   |
| **Endowed-progress onboarding** (start "20% there")              | loyalty programs                | ❌                               | Medium   |
| **Commitment device at signup** (pledge/intention)               | Stickk, Tiny Habits             | ❌                               | Low      |
| **Fresh-start prompts** (Mondays, 1st, Ramadan, Hijri new month) | habit research                  | ❌                               | Medium   |
| **Personal insights / "you're most consistent on…"**             | Salah Streak                    | 🟡 heatmap only                  | Low      |
| **Levels / XP progression**                                      | Duolingo                        | ❌                               | Low      |
| **Customisation (avatar, themes)**                               | Finch, Habitica                 | ❌                               | Low      |

### The five highest-leverage gaps

1. **Reminders are the missing trigger.** Every competitor leads with them; the
   Hook loop _starts_ with a trigger. Without them Cetele relies on the user
   remembering — the single biggest retention hole. (Already scoped as v1.1 /
   CET-11 — promote its priority.)
2. **Variable-reward milestones aren't live.** The strongest dopamine schedule is
   built into the plan (CET-10) but not shipped. This is the cheapest big win.
3. **No "winnable" social competition.** The weekly leaderboard is global-to-the-
   group and can dishearten the bottom half. Duolingo's lesson: matchmaking +
   tiers make competition feel _winnable_; small sub-group/pair goals beat one
   ranking.
4. **No emotional/identity layer.** Finch's bird and Forest's forest give effort a
   _face_. Cetele has numbers and rings; a "group garden that grows as the cetele
   completes" would convert abstract progress into something users protect.
5. **No fresh-start / re-engagement hooks.** Nothing re-invites a lapsed user on a
   natural reset (Monday, 1st of month, Hijri new month, Ramadan) — a proven,
   low-cost re-engagement lever.

---

## Sources

- Habit-app surveys: [Habitica alternatives](https://makeheadway.com/blog/habitica-alternatives/) ·
  [Best habit trackers 2026](https://habi.app/insights/best-habit-tracker-apps/) ·
  [Zapier](https://zapier.com/blog/best-habit-tracker-app/) ·
  [apps like Habitica](https://tms-outsource.com/blog/posts/apps-like-habitica/).
- Duolingo: [StriveCloud](https://www.strivecloud.io/blog/blog-gamification-examples-boost-user-retention-duolingo) ·
  [Trophy](https://trophy.so/blog/duolingo-gamification-case-study) ·
  [Orizon](https://www.orizon.co/blog/duolingos-gamification-secrets).
- Streaks psychology: [Smashing Magazine](https://www.smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/) ·
  [Design Bootcamp](https://medium.com/design-bootcamp/designing-for-user-retention-the-psychology-behind-streaks-cf0fd84b8ff9) ·
  [Plotline](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps).
- Muslim apps: [My Salah Tracker](https://mysalahtracker.app/best-salah-tracking-apps-in-2026-stay-consistent-all-year-round/) ·
  [DeenUp](https://www.deenup.app/blog/islamic-goal-tracking-apps-guide) ·
  [Islamic Lifestyle Apps study](https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2595545).
  </content>
