# What to build next — feature recommendations for Cetele

The synthesis doc: it takes the **competitive gaps**
(`01-competitive-landscape.md`) and the **motivation science**
(`02-motivation-and-reward-design.md`) and turns them into a single, opinionated,
prioritised answer to "what should Cetele actually build?" Written 2026-06-25.

> **How features were scored.** Each candidate is rated on **Impact** = (strength
> of the psychological lever) × (how badly the competitive gap hurts) × (fit with
> Cetele's North Star: 70% group consistency over 90 days), against **Effort**.
> We bias toward _white-hat, group-first, worship-appropriate_ mechanics.

---

## TL;DR — if you build only five things, build these

1. **Reminders + habit-stacking** — _the missing trigger._ The whole habit loop
   can't start without it; every competitor leads with it. **(Highest priority.)**
2. **Ship variable-reward milestones** — the strongest dopamine schedule, already
   scoped (CET-10), cheap, not yet live.
3. **The group garden** (the "accountability pet", evolved) — the missing
   emotional/identity layer, built _on the group_ so it reinforces your moat.
4. **One-tap peer reactions** (a dua/❤️ on a peer's completion) — near-free
   relatedness, the social spark Cetele has no version of.
5. **Fresh-start re-engagement** (Hijri month / Ramadan / Monday) — the cheapest
   way to win lapsed users back.

Everything else (badges, endowed-progress onboarding, sub-group goals) is real but
secondary. Details and the full ranking below.

---

## The master ranking

Tier = recommended build order. Mechanism links to `02-…`; precedent to `01-…`.

| Feature                                  | Psychological lever (doc 02)                    | Competitive precedent (doc 01) | Impact | Effort | Tier  |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------ | ------ | ------ | ----- |
| **Reminders + habit-stacking**           | Hook _trigger_; Fogg _prompt_ (B=MAP)           | Duolingo, every Salah app      | ★★★★★  | M      | **0** |
| **Variable-reward milestones**           | Variable-ratio reward; reward-prediction error  | Habitica loot                  | ★★★★★  | S–M    | **0** |
| **Group garden** (collective artefact)   | Ownership + relatedness; loss aversion (gently) | Finch pet, Forest forest       | ★★★★★  | L      | **1** |
| **One-tap peer reactions** (dua/kudos)   | Relatedness (social variable reward)            | Strava kudos                   | ★★★★☆  | S      | **1** |
| **Fresh-start re-engagement**            | Fresh-start effect                              | (under-used by everyone)       | ★★★★☆  | S      | **1** |
| **Streak & monthly award badges**        | Escalating accomplishment; fresh-start landmark | Apple Fitness awards           | ★★★☆☆  | S–M    | **2** |
| **Endowed-progress onboarding**          | Endowed-progress effect                         | loyalty programs               | ★★★☆☆  | S      | **2** |
| **Winnable sub-group / pair goals**      | Competence; _winnable_ competition              | Duolingo quests/leagues        | ★★★☆☆  | M      | **2** |
| **Abstraction pass** (GLANCE→DETAIL→RAW) | Cognitive-load mgmt; anti-shame                 | Streaks minimalism             | ★★★☆☆  | M      | **2** |
| Levels / XP                              | Accomplishment (but extrinsic)                  | Duolingo                       | ★★☆☆☆  | M      | 3     |
| Avatar/theme customisation               | Autonomy (cosmetic)                             | Finch, Habitica                | ★★☆☆☆  | M      | 3     |

---

## The top picks, in depth

### Tier 0 — fix the foundation (do these first)

**1. Reminders + habit-stacking.** Right now Cetele depends on the user
_remembering_ to open it — the single biggest hole. The Hook loop literally begins
with a **trigger** (doc 02 §A-10), and Fogg's model says a behaviour needs a
**prompt** at the moment motivation and ability align (§A-9). Do it well:

- A daily nudge, but **timed to the dhikr moment**, not a random hour.
- **Habit-stacking** copy — "After Fajr, complete your SubhanAllah ×100" — the
  Tiny-Habits anchor pattern, far stickier than "don't forget!".
- Eventually, **smart timing** (learn when each user logs and nudge just before).
- Already scoped as **CET-11** — promote it from v1.1 to _now_.

**2. Ship variable-reward milestones.** A surprise **dua / ayah / animation** at
unpredictable moments near real milestones. This is the **single strongest dopamine
mechanic** (variable-ratio, §A-2) and it's _already designed_ (**CET-10**), just
not live. Keep it **earned and bounded** (a real achievement, a meaningful reward
pointing back to worship) so it's a delight, not a slot machine.

### Tier 1 — the emotional layer & social spark (your biggest gaps)

**3. The group garden — the "accountability pet", done the Cetele way.**

The gap it fills: Cetele is all numbers and rings — **no emotional or identity
layer**. Finch (a bird you nurture) and Forest (a forest you grow) prove how
powerful "a living thing that depends on you" is. **My recommendation: make it
_collective_, not individual.**

- **What it is:** a shared garden for each circle. Every day the group closes its
  rings, the garden grows — trees, flowers, water. A patchy week, it goes dormant
  (calm/wilting, **never dead or shaming**); activity revives it.
- **Why collective beats a solo pet:**
  - It reinforces your **moat** — the _cetele_, a real group completing together —
    instead of pulling focus to a personal avatar (Habitica's fatigue trap).
  - **Relatedness + ownership** (§A-8, §A-11 white-hat): "our garden" is a thing
    the group protects _together_; one person's effort visibly helps everyone.
  - **Tone:** a garden is deeply resonant in Islamic imagery (jannah / "gardens
    beneath which rivers flow") — emotionally rich without feeling like a cartoon.
- **Optional personal touch:** each member tends their own corner/plant that feeds
  the shared garden — a little autonomy + identity without fragmenting the group.
- **Effort:** this is the big one (L). Could ship a simple v1 (a growth bar that
  becomes a few illustrated stages) and enrich later.

> **Verdict on the pet idea:** the instinct is right and it targets the most
> valuable gap — just evolve the _form_ from a solo mascot to a **shared, growing
> garden** so it amplifies group accountability and suits a worship context. If
> you ever want a personal companion too, add it as the "your corner" layer, not
> the centrepiece.

**4. One-tap peer reactions.** When a peer closes their rings, let others send a
**one-tap dua / "barakAllahu feek" / ❤️**. Near-zero effort, and it manufactures
the **relatedness** spark (§A-8) Cetele currently has no version of — the digital
equivalent of a nod across the room. Strava's kudos run on exactly this.

**5. Fresh-start re-engagement.** Almost nobody does this well, and it's cheap. Use
**temporal landmarks** (§A-7) — a Hijri new month, **Ramadan**, the start of a
week — to re-invite lapsed members with a clean-slate framing ("New month, fresh
start — your circle is waiting"). The most cost-effective lever for winning back
the people who slipped.

### Tier 2 — worth doing, not urgent

- **Award badges** at streak landmarks (7/30/100 days) and **monthly** — escalating
  accomplishment (§A-2 "escalate, don't saturate"); pairs naturally with the
  fresh-start moment.
- **Endowed-progress onboarding** — start a new member/group visibly "part-way"
  (a pre-filled first contribution, the group goal already moving), so day one
  feels like momentum, not a cold start (§A-6).
- **Winnable sub-group / pair goals** — instead of one group ranking (which can
  dishearten the bottom half), let two friends or a sub-group share a goal. Keeps
  competition **winnable** (Duolingo's lesson) and intrinsic.
- **Abstraction pass** — enforce GLANCE → DETAIL → RAW and calm low-states across
  all screens (doc 02 §C). Lower-impact than new features, but it protects
  motivation as you add layers.

### Tier 3 — later / optional

Levels/XP and cosmetic customisation are fine but **extrinsic** — SDT warns that
controlling "do X to get Y" rewards can _undermine_ intrinsic interest (§A-8). For
a worship app, lean on meaning, group, and mastery before points-for-points.

---

## Recommended phased roadmap

| Phase                                                     | Ship                                                               | Theme                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| **Now** (pre-backend polish or first post-backend sprint) | Reminders + habit-stacking; variable-reward milestones             | _Close the loop_ — trigger + the dopamine spark |
| **Next**                                                  | Group garden v1; one-tap peer reactions; fresh-start re-engagement | _Make it feel alive & social_                   |
| **Then**                                                  | Award badges; endowed-progress onboarding; abstraction pass        | _Polish the motivation surface_                 |
| **Later**                                                 | Sub-group/pair goals; (optional) levels, customisation             | _Depth & replayability_                         |

> Sequencing logic: you can't reward a return you never **triggered** (Phase Now),
> and an emotional/social layer (Phase Next) compounds best once people are
> actually coming back. Each phase assumes the one before it.

---

## How this ladders up to the North Star

70% group consistency over 90 days needs three things, and these features supply
each: a **reason to come today** (reminders + variable reward), a **reason to care
over weeks** (the group garden + peer bonds + badges), and a **way back after a
slip** (fresh-start + never-miss-twice). Build in that order.

**Next step:** turn Phase "Now" into Linear issues (CET-10, CET-11 already exist —
re-prioritise them) and spec the **group garden** as a new issue. Fold the
abstraction rules into `docs/UI_PRACTICES.md`.

---

## Sources

Drawn from `research/01-competitive-landscape.md` and
`research/02-motivation-and-reward-design.md` — see those for the full citation
lists (Duolingo/Habitica/Finch/Forest case studies; Hook Model, SDT, Fogg, Octalysis,
loss-aversion / goal-gradient / endowed-progress / fresh-start research).
</content>
