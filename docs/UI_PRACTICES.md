# UI Colour, Theming & Responsive Practices — Cetele

Research-backed rules for how Cetele uses **colour**, **light/dark theming**, and
**responsive layout** to maximise the one metric that matters: people _coming
back_. Researched 2026-06-24. Apply together with the brand decisions
(D11/D13/D14) and the token contract in `app/globals.css` + `docs/DESIGN_SYSTEM.md`.

> **Cetele is a habit app, not a mastery app.** Unlike arabic-app (which argues
> _against_ gamification), Cetele's thesis is that dhikr is repetitive
> habit-maintenance — the exact case where dopamine mechanics work. So we **lean
> into** earned dopamine (rings, streaks, milestones, variable reward) but anchor
> it in real group accountability + never-miss-twice forgiveness (D8). The colour
> and motion rules below reflect that: warm/celebratory moments are a _feature_
> here, spent deliberately, not suppressed.

**How to use this doc:** each section ends in **"Rules to hold"** — the
enforceable bar for any UI work, checked at review time. Open shortcomings are
tracked in the implementation tracker so the work is referenceable without this
doc open.

## Implementation tracker (research → work)

| §   | Finding / shortcoming                                                                                                                             | Action                                                                                       | Priority |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| §1  | Green is underused. For a _dhikr_ audience it carries cultural+psychological weight (growth, calm, spirituality). Promote to a semantic.          | Elevate `--success`/new `--growth` to completion/streak role; decision needed (touches D13). | High     |
| §2  | App follows OS theme only — **no manual light/dark toggle.** Dhikr peaks at night (82.7% enable dark after 10pm); dhikr ≈ Isha/Tahajjud/pre-Fajr. | Add persisted theme toggle (system / light / dark); `class` strategy.                        | High     |
| §2  | Dark accent orange is fully saturated → "vibrates" on dark surfaces. Off-white text is good; verify no pure black.                                | Desaturate/lighten accent + status hues in the dark block.                                   | Medium   |
| §3  | **Not responsive** — hard-capped at `max-w-[28rem]` with a phone bottom-nav. Unusable as a real layout on laptop/desktop.                         | Responsive shell: bottom-nav (mobile) → sidebar + wider/multi-col (≥`lg`).                   | High     |
| §4  | Motion budget + earned-celebration model **validated** — keep within 150–300ms / spring only on celebration.                                      | — (review-time bar)                                                                          | —        |
| §5  | Status today leans on colour; some states (rings, leaderboard) need a second channel for colour-blind safety.                                     | Glyph/label beside every status colour; never colour-alone.                                  | Medium   |
| §1  | Navy+orange brand **validated as psychologically optimal** for trust + action — no re-theme needed.                                               | — (keep D11)                                                                                 | —        |

---

## 1. Colour psychology — engineered for return, not decoration

### What the research says

- **Streaks fire dopamine through anticipation, and colour marks the stakes.**
  Apps pairing streaks + milestones see **40–60% higher DAU** and **~35% lower
  30-day churn**; users are **2.3× more likely** to return daily once past a
  7-day streak. The colour job is to make _progress and its preservation_
  unmistakable at a glance.
- **Navy = trust; orange = energy; together they're the strongest pair.** Blue
  raises perceived trustworthiness by **~42%** in service contexts; **navy+orange
  is rated ~34% more trustworthy** than other pairings, and a bright orange CTA
  on a navy field wins by the **isolation (Von Restorff) effect** — contrast,
  not hue, drives the **32–40% higher click** on warm CTAs.
- **Green means growth, calm, and — for this audience — spirituality.** Islamic
  apps default to green/teal precisely because it reads as harmony, renewal, and
  serenity; it lowers anxiety and recalls nature. It is the natural colour of
  _"this is done / alive / growing."_
- **If everything is colourful, nothing is.** Bright accents work by scarcity —
  one accent per view; >~3 hues raises cognitive load and _lowers_ retention.

### How this maps to Cetele (the synthesis)

Keep the brand; give each hue **one consistent psychological job**:

| Token                        | Colour            | Job (consistent everywhere)                                                                                                   |
| ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--primary` (navy)           | `#1D3A5F`         | **Trust / calm surface.** Headers, the live-counter card, structure. The workhorse backdrop.                                  |
| `--accent` (orange)          | `#F26522`         | **Earned action + celebration spark.** One primary CTA per view; confetti; "tap to count". Never body, never decoration.      |
| `--success`/`growth` (green) | `#16A34A`+        | **Completion / streak-alive / growth.** Closed rings, "done", streak flames-alive, group goal met. The dhikr-resonant anchor. |
| `--danger` (red)             | `#DC2626`         | **Errors only.** Never urgency/FOMO ("streak about to die!") — that breaks D8 and is bad colour practice.                     |
| neutral slate                | `#F8FAFC` surface | Low-glare calm. Cards stay white for gentle depth.                                                                            |

This resolves the green tension: **navy+orange stays the brand** (validated as
optimal for trust+action), and **green becomes the meaning of progress** — which
is simultaneously the correct retention signal _and_ the culturally-expected
spiritual hue for a dhikr community.

### Rules to hold

1. **One accent per view.** Orange marks the single most important action or the
   celebration moment — nothing else. If two things are orange, one is wrong.
2. **Meaning is fixed, never reassigned per screen:** navy = trust/surface,
   orange = act/celebrate, **green = complete/alive/grow**, red = error.
3. **Orange is earned and spent.** It appears at the count tap, the closing ring,
   the milestone — so its arousal value lands. A screen with no action shows no
   orange.
4. **Never red-for-urgency.** "Don't break your streak" is framed by
   _forgiveness_ (never-miss-twice), shown in calm green/neutral — not red alarm.
5. **Contrast carries CTAs, not hue.** `accent-foreground` stays **navy on
   orange** (~5.0:1 AA; white-on-orange ~3.1 fails) — also the Youth Nexus
   pairing (D13).
6. **Test outcomes, not opinions.** When we A/B, measure returns/closed-rings,
   not clicks.

---

## 2. Light & dark mode — modular by token, toggled by choice

### What the research says

- **Dark mode is now table stakes:** ~**80%** of users want the option, **65%+**
  use it where offered; **82.7%** enable it after **10pm**.
- **Auto + override is the expected pattern:** ~**64.6%** want the site to follow
  system theme by default — _and_ a manual switch for the rest.
- **Craft the dark surface, don't invert:** avoid pure black (`#000`) — use
  ~`#121212`/very-dark-navy to prevent glare; text is **off-white, not pure
  white** (halation for astigmatism); **desaturate/lighten saturated accents** or
  they vibrate/bleed on dark. AA contrast (4.5:1 body / 3:1 large) applies in
  _both_ themes.

### Why this matters _more_ for Cetele

Dhikr concentrates at night — **after Isha, Tahajjud, the pre-Fajr window.** The
moment a user is most likely to open Cetele is exactly when a glaring white
screen is most punishing. Dark mode here isn't cosmetic; it's aligned with the
core use moment. A calm, true-dark night surface _is_ retention.

### Current state (good bones, two gaps)

`app/globals.css` is **already fully tokenised** with a complete
`@media (prefers-color-scheme: dark)` block — light/dark values both exist, all
semantic. Gaps: (a) **no manual toggle** (OS-only); (b) the dark **accent stays
fully saturated** `#F26522` and should soften.

### Rules to hold

1. **System default + persisted manual override** (System / Light / Dark). Use a
   `class` on `<html>` (`dark`) so the toggle wins over the media query; persist
   to `localStorage`; set before paint to avoid a flash (FOUC).
2. **Every colour is a token** (already enforced, D14). A theme is a swap of CSS
   variables — never a per-component override.
3. **Dark surface ≥ `#101a28`-ish navy-black, never `#000`; text off-white.**
   Keep the existing soft values; don't invert to pure black/white.
4. **Desaturate accents/status on dark** so orange/green/red sit calmly; keep AA
   in both themes (re-check `muted-foreground` and accent-on-dark).
5. **`prefers-reduced-motion` and theme both respected at the system level**, with
   user override always available.

---

## 3. Responsive — one product, phone → desktop

### What the research says

- **Mobile-first, then widen at relative breakpoints:** ~**640px** (component
  reflow / hamburger), **768px** (two-column), **≥1024px** (full sidebar / desk
  layout). Define breakpoints in relative units, not device sizes.
- **Navigation should _transform_, not just shrink:** **bottom tab bar on mobile**
  (thumb reach) → **persistent side nav on desktop**; single column → multi-column;
  bigger tap targets and line-height on small screens.

### How this maps to Cetele

Today the app is a fixed **`max-w-[28rem]` phone column with a bottom nav** — fine
on a phone, wasteful and odd on a laptop. Target:

| Viewport               | Layout                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **< `md`** (phone)     | Current single column + **bottom tab nav** (keep — it's right for thumbs).                                                                                 |
| **`md`–`lg`** (tablet) | Wider content column, larger rings/cards; bottom nav or top nav.                                                                                           |
| **≥ `lg`** (desktop)   | **Left sidebar nav** replaces bottom bar; centred content max-width; dashboard can go **two-column** (e.g. rings + live counter/leaderboard side by side). |

The app stays installable-PWA mobile-first; desktop is a _widening_, not a
separate design. The phone frame (`max-w`) becomes a `lg`-and-down treatment.

### Rules to hold

1. **Mobile-first, additive breakpoints.** Base styles target the phone; `md:`/`lg:`
   add desktop affordances — never the reverse.
2. **Nav transforms by breakpoint:** bottom tabs (mobile) ↔ sidebar (desktop);
   the same routes, re-housed. Never show both.
3. **No fixed phone-width cage on desktop.** Content uses a sensible reading
   max-width and real whitespace, not a 28rem column floating in grey.
4. **Tap targets ≥ 44px on touch; hover states only where a pointer exists.**
5. **Test the three sizes** (≈375 / 768 / 1280) before any merge.

---

## 4. Motion & dopamine — earned, instant, escalating (validated)

The arabic-app motion budget transfers directly and is **kept as-is**:

1. **150–300ms** micro-interactions, **≤500ms** transitions; **spring**
   (`--ease-spring`) **only** at celebration moments (ring close, milestone).
2. **Feedback is instant** — the tap→count→ring response fires immediately; delay
   kills the dopamine loop.
3. **Escalate, don't saturate:** same-size celebration for same-size win; reserve
   the big confetti burst for the big finish (hedonic adaptation makes constant
   fireworks meaningless).
4. **`prefers-reduced-motion` is absolute** — every effect no-ops.
5. **Haptics accompany, never carry, meaning.**

> Cetele difference vs arabic-app: **variable-reward milestones are embraced
> here** (CET-10) — but stay _earned and bounded_ (surprise du'a at real
> milestones), never a slot-machine. Ethical line: sustainable habit, not
> dependence.

---

## 5. Colour-blind safety — never colour alone

### What the research says

**Deuteranopia (~6–8% of men)** makes green/amber/orange/light-red
near-indistinguishable — exactly our status hues. **Colour must never be the only
signal**; pair it with a glyph, label, shape, or position.

### How this maps to Cetele (audit)

| Surface              | Today                      | Verdict                                                           |
| -------------------- | -------------------------- | ----------------------------------------------------------------- |
| Closed ring          | turns green                | ⚠️ add a ✓ glyph in-ring (already partly there — keep mandatory). |
| Leaderboard rank     | colour highlight for "you" | ✅ also a "you" text badge — keep.                                |
| Streak alive/at-risk | colour                     | ⚠️ pair with flame glyph + number, never colour alone.            |
| Group goal met       | green bar                  | ⚠️ add "met"/✓ label at 100%.                                     |

### Rules to hold

1. **Every status colour ships with a glyph or label** (✓ / flame / "met").
2. **Never green-vs-red as the only differentiator.**
3. Future charts use **pattern/intensity + labels**, not hue alone.

---

## Sources

- Streaks & retention: Plotline (_Streaks & milestones_) · UX Magazine (_Hot
  streak game design_) · Medium/Design Bootcamp (_Streaks & daily rewards_).
- Colour psychology & conversion: UpwardArrow / allbranded (blue & trust) ·
  Absolute Digital + Striven (CTA colour, isolation effect) · usevisuals (B2B
  trust vs urgency) · Toptal (colour psychology).
- Islamic/green: colors.muz.li (Islamic Green) · Dribbble/Behance Islamic-app
  galleries · _Daily Muslim_ UX case study (themeaningofislam.org).
- Dark mode: gitnux / wifitalents / forms.app (usage stats 2026) · NN/g (_Dark
  Mode: how users think about it_) · AlterSquare (startup adoption).
- Dark-mode craft & contrast: WebAIM (contrast) · accessibilitychecker.org +
  DubBot (dark-mode a11y) · NateBal (dark-mode best practices 2026).
- Responsive: MDN (_Responsive navigation patterns_) · Framer (_Breakpoints 2026
  guide_) · CodyHouse (responsive sidebar) · navbar.gallery (sidebar examples).
- Colour-blindness: courseux + colorblind.io · atmos.style · designsystemproblems.com.
- Internal: `app/globals.css` (tokens) · `docs/DESIGN_SYSTEM.md` · `.claude/STATUS.md`
  (D8/D11/D13/D14).
