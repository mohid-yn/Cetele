# Cetele Design System — v4 (Youth Nexus)

> **Status: ON A BRANCH, awaiting owner review** (`feat/youth-nexus-rebrand`). v4 re-hues every v3 value onto the
> Youth Nexus palette. **The method is what makes it safe:** each colour keeps its exact CIE L*, and relative
> luminance depends on L* alone, so **every contrast ratio below still holds**. Only the named overrides moved.
> Read "sage / rose / tan / plum" in the v3 sections as **primary / accent / neutral / outline**.

## v4 at a glance

| Role                    | v3                  | v4                                                                | Anchor                                                 |
| ----------------------- | ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Primary                 | sage                | Youth Nexus blue, ramp deepens to YN navy                         | `--primary` `#0163ad` light · `#a0cefe` dark           |
| Accent                  | rose                | Youth Nexus orange, **exact** in both themes                      | `--accent` `#f09a3e`, navy label 7.61:1 (6.10 pressed) |
| Success                 | sage-deeper         | green, **unchanged**: "done" is no longer the brand hue           | `--success` `#21703e`                                  |
| Neutral                 | tan paper           | cool slate; **cards are pure white**                              | page `#f6f9fe` · card `#ffffff`                        |
| Outline                 | plum                | navy-grey                                                         | `--outline` `#6f7782` (4.53:1 on card)                 |
| Danger · warning · info | rust · ochre · blue | red · gold · teal (moved off the new brand hues)                  |                                                        |
| Dark                    | warm brown          | deep YN navy                                                      | page `#0d141c` · card `#151c25`                        |
| Display                 | Figtree             | **Chivo** (the Youth Nexus site's heading face); body stays Geist |                                                        |

Source: the Youth Nexus site (youthnexus.org.au), whose CSS uses orange `#f09a3e`/`#f0632e`, navy `#333c4e`/`#072c5e`
and blue `#1172c1` on white. Motion is unchanged: it already followed the strong ease-out curve,
sub-300ms timings and `scale(0.97)` press feedback that the reference motion guidance asks for. The brand mark
keeps its shape and takes blue to navy plus the two YN oranges. The group garden stays green (leaves are green).

---

# v3 derivation (the values v4 was re-hued from)

Palette source: the owner's five swatches — `#FAB3A9 · #C6AD94 · #7FB285 · #463239 · #ED6B86`.
Structure: **Material Design 3** tonal palettes, colour roles and state layers, adapted to this
codebase's constraints. Live reference: **`/designsystem`** · Tokens: **`app/globals.css`**

---

## 1. Direction

**A tally sheet, kept together.** Muted botanical warmth — sage, clay, rose — on warm paper. Nothing
in the palette is loud except one colour, and that colour is spent only on what a member earned.

The five swatches are not a system; they are a mood. Measured, all five sit between **L\* 34 and 79**,
and **four of the five cannot carry white text** (sage 2.44:1, tan 2.14:1, salmon 1.74:1, rose 2.98:1).
They are _container_ tones — soft fills that take dark text — which is exactly what Material 3's
container roles are for. That is why the M3 model is the right structure here rather than a fashion:
the palette you chose is already shaped like it.

Each swatch becomes the hue anchor of a full tonal palette, and each keeps a real job:

| Swatch           |     | Role                                                       | Where it survives                   |
| ---------------- | --- | ---------------------------------------------------------- | ----------------------------------- |
| `#ED6B86` rose   | ▮   | **Accent** — the one earned action, celebration            | Hue + L\* kept; chroma ×0.75 (§3.2) |
| `#7FB285` sage   | ▮   | **Primary** — brand, calm, growth, completion              | primary tone 70                     |
| `#C6AD94` tan    | ▮   | **Neutral** — paper, every surface and border              | neutral tone 70                     |
| `#463239` plum   | ▮   | **Neutral-variant** — ink, outlines, secondary text        | neutral-variant tone 20             |
| `#FAB3A9` salmon | ▮   | **Accent container** — soft rose fills, celebration washes | accent tone 80                      |

**Green stays the brand.** Sage replaces emerald, but the locked meaning — green is calm, growth, and
the completion signal, and is culturally expected for a dhikr audience — is preserved. **Gold is
gone**, and that is the one meaning this palette does not carry forward.

**The signature is the notched ring.** `ProgressRing` with a `mark` at the circle's share while the
arc runs to your own goal (D51) is a form that exists nowhere else and states the product in one
shape: what the group asked of you, and what you took on yourself. It gets the most careful detailing
in the system (§8.9). Everything else stays quiet so it can carry.

---

## 2. How the colour system works

Adopted from Material 3, with the parts that are verifiable taken from the reference implementation
rather than the docs:

1. **Tonal palettes.** Each key hue expands to tones **0–100**, where the tone number _is_ CIE L\*.
   Tone 40 on tone 100 is always ≈4.5:1+ — contrast becomes a property of the system, not a per-pair
   accident.
2. **Colour roles come in pairs.** Never a fill without its `on-` colour. `--primary` / `--on-primary`,
   `--accent-container` / `--on-accent-container`. **You cannot reference a fill without inheriting its
   text colour**, which is the single biggest defence against this codebase's recurring contrast bugs.
3. **Surface containers.** Five neutral tiers replace the ad-hoc `card` / `muted` pair — and give the
   navigation its own surface, which v1 never had.
4. **State layers.** Interaction states are the `on-` colour composited over the fill at a fixed
   opacity: **hover 8%, focus 12%, pressed 12%, dragged 16%** (from `material-web`'s
   `md-sys-state` tokens; note M3's own prose contradicts itself on pressed, quoting 12% and 16% in
   different places — another reason to bake them).

**Deviation, deliberate: state layers are precomputed to solid hex.** M3 applies them as a live alpha
overlay. This codebase has been bitten repeatedly by alpha over an unknown surface (a `bg-muted/40`
resting card measured **1.01:1** against the page), so every state is a real token with a measured
value. Same model, no runtime uncertainty.

**Deviation, deliberate: the accent is a light fill with a dark label.** M3 would make the accent tone
40 (`#94414f`, a deep wine) so it can carry white text. That throws away the rose you picked. Instead
`--accent` keeps the rose's hue and lightness with a tone-10 label at **5.85:1** — holding through
hover (5.16) and pressed (4.84). This also matches what the app already did with gold. The fill itself
is now `#d9798a` rather than the swatch exactly; see §3.2.

---

## 3. Tonal palettes

| Tone   | primary · sage        | accent · rose        | neutral · tan         | neutral-var · plum |
| ------ | --------------------- | -------------------- | --------------------- | ------------------ |
| 10     | `#112013`             | `#2a1318`            | `#1f1b16`             | `#1f1a1c`          |
| 20     | `#1f3723`             | `#482329`            | `#372f27`             | `#372e31`          |
| 30     | `#23522c`             | `#702b3a`            | `#524435`             | `#514247`          |
| 40     | `#346d3f`             | `#94414f`            | `#6d5b49`             | `#6c595f`          |
| 45     | —                     | `#a2475a`            | —                     | —                  |
| 50     | `#488753`             | `#b25266`            | `#87735e`             | `#867077`          |
| 60     | `#62a26c`             | `#ce6c7f`            | `#a28c77`             | `#a08a91`          |
| **62** | —                     | `#d9798a` ← softened | —                     | —                  |
| 70     | **`#82bd8a`** ≈ yours | `#e98a9b`            | **`#bca894`** ≈ yours | `#bba5ac`          |
| 80     | `#a3d6a9`             | `#f1b0ba`            | `#d5c3b2`             | `#d4c1c7`          |
| 90     | `#d4ead6`             | `#f7d7dc`            | `#eee0d3`             | `#e9e0e3`          |
| 95     | `#e4f7e6`             | `#fbeaec`            | `#faefe3`             | `#f6eef1`          |
| 98     | `#effff0`             | `#fdf7f7`            | `#fff8ee`             | `#fef8fa`          |

**Status hues.** Sited to maximise the minimum gap between neighbours, which this palette makes hard —
see §3.1.

| Tone | success · H152 | warning · H78 | danger · H40 | info · H250 |
| ---- | -------------- | ------------- | ------------ | ----------- |
| 10   | `#0e2013`      | `#261903`     | `#2b150d`    | `#141c25`   |
| 20   | `#193823`      | `#422c01`     | `#4a2517`    | `#243240`   |
| 30   | `#12542c`      | `#603f00`     | `#742e14`    | `#2f4963`   |
| 40   | `#21703e`      | `#7f5500`     | `#964222`    | `#426181`   |
| 70   | `#74c089`      | `#d7a143`     | `#ed906f`    | `#8eafd3`   |
| 80   | `#99d9a9`      | `#eebe72`     | `#ffaf93`    | `#adcae9`   |
| 90   | `#d0ebd6`      | `#f4e0c1`     | `#fed9cd`    | `#d7e4f2`   |

### 3.1 The palette's one real constraint — read before changing a status colour

**This palette is entirely warm, and its accent sits where danger conventionally lives.** Rose is
H=9°; a conventional danger red is H≈25°. There is no hue in this palette that is both recognisably
"error" and safely far from the accent — every candidate lands within 11° of rose or 8° of salmon.

Measured, the best available compromise is **danger at H=40°**, which maximises the minimum gap:
**31° from the accent, 32° from warning**. Consequences you must design around:

- **Danger is a grave rust-red (`#964222`), not a vivid alarm red.** This is a fit, not a defect: D8
  already forbids red as urgency or FOMO, so a serious, low-arousal red is the correct register.
- **`--accent` and `--danger` are 31° apart and similar in lightness in dark mode.** The
  **never-colour-alone rule (§7.3) is therefore load-bearing, not a nicety.** Every destructive
  control carries a word or a glyph. This is the one place where dropping that rule breaks the app for
  colour-blind users.
- **Success shares the primary's hue family (4° apart), by design.** Green is the completion colour;
  a separate "success" hue would say completion twice in two languages.

---

### 3.2 The accent was SOFTENED, 2026-08-02 — chroma ×0.75

The accent column above is the original derivation. Every accent tone now carries **0.75× its chroma**,
with **L\* and hue untouched**.

**Why.** Measured in CIE LCH, the original rose was the loudest colour in a palette whose stated
direction (§1) is _muted botanical warmth_:

|                       | L\*  | C\*      | H°    |
| --------------------- | ---- | -------- | ----- |
| rose (was)            | 61.9 | **53.6** | 10.9  |
| rose (now, `#d9798a`) | 61.9 | **39.8** | 10.8  |
| sage — the brand      | 41.3 | 35.9     | 145.9 |
| rust — danger         | 38.7 | 48.7     | 47.0  |
| surfaces, mean        | ~96  | 6.0      | ~85   |

It was **1.49× the chroma of the brand colour** and 9× the surfaces — and **more chromatic than
danger**, so the error colour was quieter than the celebration colour, which is backwards for the one
pair that must never be confused (§3.1). It is now 1.11× the brand, and danger is again the more
saturated of the two.

**Because L\* is preserved, no contrast pair moved.** Label on accent goes 5.84 → **5.85** at rest,
5.16 → 5.16 hover, 4.81 → **4.84** pressed; `--accent-ink` 5.6 → **5.75** on card. Working in LCH is
what makes a chroma change safe: pull chroma and every ratio holds; pull lightness and they all move.

`public/logo.svg` was scaled by the same factor, and the 4 PWA icons + 36 iOS launch images
regenerated — a mark that out-saturates the UI it sits in is the same mismatch one level up.

> This reverses "**`--accent` is `#ED6B86` exactly**" from the original v3 derivation, on the owner's
> call. The hue was never the problem: sage→rose is **135°**, a split-complementary pairing, and
> sage-green with dusty rose is a classic botanical combination. The loudness was.

## 4. Colour roles

### 4.1 Light

| Token                 | Value     |     | Token                      | Value     |
| --------------------- | --------- | --- | -------------------------- | --------- |
| `--primary`           | `#346d3f` | ▮   | `--on-primary`             | `#f7fff8` |
| `--primary-container` | `#d4ead6` | ▮   | `--on-primary-container`   | `#112013` |
| `--accent`            | `#d9798a` | ▮   | `--on-accent`              | `#2a1318` |
| `--accent-container`  | `#f7d7dc` | ▮   | `--on-accent-container`    | `#2a1318` |
| `--accent-ink`        | `#a2475a` | ▮   | _accent as text/thin mark_ | 5.75:1    |
| `--surface`           | `#fff8ee` | ▮   | `--on-surface`             | `#1f1b16` |
| `--surface-lowest`    | `#fffdf4` | ▮   | `--on-surface-variant`     | `#514247` |
| `--surface-low`       | `#fdf2e7` | ▮   | `--outline`                | `#867077` |
| `--surface-default`   | `#f7ebe0` | ▮   | `--outline-variant`        | `#d4c1c7` |
| `--surface-high`      | `#f3e6da` | ▮   | `--success`                | `#21703e` |
| `--surface-highest`   | `#eee0d3` | ▮   | `--warning`                | `#7f5500` |
| `--danger`            | `#964222` | ▮   | `--info`                   | `#426181` |
| `--success-container` | `#d0ebd6` | ▮   | `--on-success-container`   | `#0e2013` |
| `--warning-container` | `#f4e0c1` | ▮   | `--on-warning-container`   | `#261903` |
| `--danger-container`  | `#fed9cd` | ▮   | `--on-danger-container`    | `#2b150d` |
| `--info-container`    | `#d7e4f2` | ▮   | `--on-info-container`      | `#141c25` |

### 4.2 Dark

| Token                 | Value     |     | Token                      | Value     |
| --------------------- | --------- | --- | -------------------------- | --------- |
| `--primary`           | `#a3d6a9` | ▮   | `--on-primary`             | `#1f3723` |
| `--primary-container` | `#23522c` | ▮   | `--on-primary-container`   | `#d4ead6` |
| `--accent`            | `#e98a9b` | ▮   | `--on-accent`              | `#482329` |
| `--accent-container`  | `#702b3a` | ▮   | `--on-accent-container`    | `#f7d7dc` |
| `--accent-ink`        | `#e98a9b` | ▮   | _accent as text/thin mark_ | 7.56:1    |
| `--surface`           | `#16130f` | ▮   | `--on-surface`             | `#eee0d3` |
| `--surface-lowest`    | `#110e0b` | ▮   | `--on-surface-variant`     | `#d4c1c7` |
| `--surface-low`       | `#1f1b16` | ▮   | `--outline`                | `#a08a91` |
| `--surface-default`   | `#241e19` | ▮   | `--outline-variant`        | `#514247` |
| `--surface-high`      | `#2f2821` | ▮   | `--success`                | `#99d9a9` |
| `--surface-highest`   | `#3e3227` | ▮   | `--warning`                | `#eebe72` |
| `--danger`            | `#ffaf93` | ▮   | `--info`                   | `#adcae9` |
| `--success-container` | `#12542c` | ▮   | `--on-success-container`   | `#d0ebd6` |
| `--warning-container` | `#603f00` | ▮   | `--on-warning-container`   | `#f4e0c1` |
| `--danger-container`  | `#742e14` | ▮   | `--on-danger-container`    | `#fed9cd` |
| `--info-container`    | `#2f4963` | ▮   | `--on-info-container`      | `#d7e4f2` |

**The pairing rule:** a fill token is never referenced without its `on-` partner. `bg-primary` implies
`text-on-primary`. If you find yourself picking a text colour for a fill, the pair is missing — add it,
don't improvise.

---

## 5. Surfaces and elevation

### 5.1 The five tiers

| Tier              | Light     | Dark      | What sits here                                       |
| ----------------- | --------- | --------- | ---------------------------------------------------- |
| `surface-lowest`  | `#fffdf4` | `#110e0b` | Cards on a busy page; the "paper" of a content block |
| `surface`         | `#fff8ee` | `#16130f` | **The page**                                         |
| `surface-low`     | `#fdf2e7` | `#1f1b16` | Resting/dormant surfaces (§8.10)                     |
| `surface-default` | `#f7ebe0` | `#241e19` | Inset wells, muted fills, input backgrounds          |
| `surface-high`    | `#f3e6da` | `#2f2821` | **Chrome** — bottom nav, sidebar, sticky headers     |
| `surface-highest` | `#eee0d3` | `#3e3227` | Menus, popovers, dialogs, segmented thumbs           |

**This is the fix for "the whole nav bar is just white."** v1's nav used `--card` (`#ffffff`) and
measured **1.08:1** against the page — chrome and content shared one token, so chrome could never look
different. It now has `surface-high`, a real tier, in both themes.

### 5.2 Elevation is expressed differently per theme

- **Light:** shadow. `--shadow-xs … --shadow-xl`, tinted **warm** (`rgb(31 27 22)`, the neutral's own
  ink) — v1 cast slate `rgb(15 23 42)` at H=266° on a warm page, which is what greyed the light theme.
- **Dark:** tone. Shadows barely register; a raised surface is a **lighter** one. Every dark elevation
  step moves _up_ the surface ladder.

> **The rule v1 broke:** a component that must look raised takes the next tier up, in **both** themes.
> The theme toggle's thumb was `--card` on a `--muted` track — lighter-on-darker in light and
> **darker-on-lighter in dark**, so at night the selected option read as pressed _into_ the control.

---

## 6. State layers

Every interactive surface has five states. The layer is the `on-` colour composited over the fill.

| State         | Opacity | Extra                                           |
| ------------- | ------- | ----------------------------------------------- |
| Rest          | —       | —                                               |
| Hover         | **8%**  | pointer only; never on touch                    |
| Focus-visible | **12%** | **+ 2px `--primary` outline, 2px offset**       |
| Pressed       | **12%** | + `translateY(1px)`                             |
| Dragged       | **16%** | + elevation step                                |
| Disabled      | —       | dedicated token pair (§7.4) — **never opacity** |

**Precomputed values** (these are the tokens; do not compute at runtime):

|                               | Rest      | Hover     | Focus / Pressed |
| ----------------------------- | --------- | --------- | --------------- |
| **light** `primary`           | `#346d3f` | `#44794e` | `#4b7f55`       |
| **light** `accent`            | `#d9798a` | `#cb7181` | `#c46d7c`       |
| **light** `danger`            | `#964222` | `#9e5133` | `#a3583c`       |
| **light** `success`           | `#21703e` | `#327b4d` | `#3b8154`       |
| **light** `primary-container` | `#d4ead6` | `#c4dac6` | `#bdd2bf`       |
| **light** `accent-container`  | `#f7d7dc` | `#eec4cb` | `#e6bcc3`       |
| **dark** `primary`            | `#a3d6a9` | `#98c99e` | `#93c399`       |
| **dark** `accent`             | `#e98a9b` | `#dc8292` | `#d67e8d`       |
| **dark** `danger`             | `#ffaf93` | `#f1a489` | `#e99e84`       |
| **dark** `primary-container`  | `#23522c` | `#315e3a` | `#386440`       |
| **dark** `accent-container`   | `#702b3a` | `#872b44` | `#8d324b`       |

For transparent variants (`ghost`, `outline`, list rows, nav items) the layer composites over the
surface beneath: hover `surface-default`, pressed `surface-high`.

---

## 7. The contrast contract

Every number in this document was computed, not judged. **114/114 pairings pass.**

| Class                       | Floor              | Applies to                                                             |
| --------------------------- | ------------------ | ---------------------------------------------------------------------- |
| Body text                   | **4.5:1**          | Text under 18.66px bold / 24px regular                                 |
| Large text                  | **3:1**            | Headings above that                                                    |
| Non-text (WCAG 2.2 §1.4.11) | **3:1**            | Component boundaries, focus rings, progress tracks, icons, chart marks |
| Disabled                    | **3:1** (practice) | Exempt from 1.4.3; still must be readable                              |
| Decorative                  | none               | Large, saturated, hue-distinct **shapes** only                         |

**Judge against the surface the element is actually drawn on, per theme** — not `--surface` by default.
A plant sits on soil; a ring's notch sits on the arc; a nav icon sits on `surface-high`.

**The accent cannot carry a thin mark on light.** `#d9798a` on the page measures **2.82:1** — under the
non-text floor. Use `--accent-ink` (`#a2475a`, 5.56:1) for accent text, icons and thin strokes on light
surfaces. The bright rose is for **fills**, where its dark label does the work. (v1 had this exact
defect with gold at 2.15:1 and handled it case by case.)

---

## 8. Components

### 8.1 Buttons — variants

**There are no hand-rolled buttons.** Every control comes from `components/ui/button.tsx`; a bare
`<button>` with utility classes is a bug, because it silently opts out of the edge, focus ring, tap
target, disabled pair and pressed state that the primitive guarantees.

| Variant               | Use                                                                       | Budget           |
| --------------------- | ------------------------------------------------------------------------- | ---------------- |
| `accent`              | **The** action of the whole view; earned/celebratory                      | **one per view** |
| `primary`             | The main action of a card or dialog                                       | one per card     |
| `subtle`              | A filled but unemphatic action — uses `--muted`                           | —                |
| `outline`             | The workhorse secondary. A control that must still look like one          | —                |
| `ghost`               | Tertiary; toolbar actions. **Only beside a louder neighbour** — see below | —                |
| `link`                | Inline navigation inside prose (pair with `size="inline"`)                | —                |
| `destructive`         | Confirmed, primary destruction — a dialog's final Delete                  | one per dialog   |
| `destructive-outline` | A destructive action that is _not_ the screen's main event                | —                |

`ghost` has no resting fill and only a transparent border, so **alone on a surface it reads as
background** — the "is that even a button?" failure. It resolves its edge to `--outline` on hover and
focus, which is enough _beside_ a filled primary (a dialog's Cancel) and not enough on its own. A
standalone quiet control takes `outline`, not `ghost`.

`destructive-outline` exists because a filled red button sitting in a quiet informational box reads as
a warning about a decision the member has not made yet. "Leave this circle" is the reference case.

> **Removed:** the `tonal` variant this table used to list was never implemented. `primary-container`
> is still a live token — the nav's active pill uses it (§8.11) — but there is no `tonal` button.

### 8.2 Buttons — the full matrix

**Light**

| Variant       | Rest                         | Hover     | Pressed   | Label          | Measured (rest/hover/press)    |
| ------------- | ---------------------------- | --------- | --------- | -------------- | ------------------------------ |
| `primary`     | `#346d3f`                    | `#44794e` | `#4b7f55` | `#f7fff8`      | **6.05 / 5.04 / 4.62**         |
| `accent`      | `#d9798a`                    | `#cb7181` | `#c46d7c` | `#2a1318`      | **5.85 / 5.16 / 4.84**         |
| _(container)_ | `#d4ead6`                    | `#c4dac6` | `#bdd2bf` | `#112013`      | **13.34 / 11.45 / 10.8**       |
| `destructive` | `#964222`                    | `#9e5133` | `#a3583c` | `#fffdfa`      | **6.71 / 5.67 / 5.19**         |
| `outline`     | transparent, 1px `--outline` | `#f7ebe0` | `#f3e6da` | `--on-surface` | 14.6 label · **4.33** boundary |
| `ghost`       | transparent                  | `#f7ebe0` | `#f3e6da` | `--on-surface` | 14.6 label                     |
| `link`        | —                            | underline | —         | `--primary`    | **5.85**                       |

**Dark**

| Variant       | Rest                         | Hover     | Pressed   | Label          | Measured (rest/hover/press)    |
| ------------- | ---------------------------- | --------- | --------- | -------------- | ------------------------------ |
| `primary`     | `#a3d6a9`                    | `#98c99e` | `#93c399` | `#1f3723`      | **7.83 / 6.87 / 6.45**         |
| `accent`      | `#e98a9b`                    | `#dc8292` | `#d67e8d` | `#482329`      | **5.54 / 4.94 / 4.67**         |
| _(container)_ | `#23522c`                    | `#315e3a` | `#386440` | `#d4ead6`      | **7.15 / 5.92 / 5.5**          |
| `destructive` | `#ffaf93`                    | `#f1a489` | `#e99e84` | `#4a2517`      | **7.49 / 6.60 / 6.18**         |
| `outline`     | transparent, 1px `--outline` | `#241e19` | `#2f2821` | `--on-surface` | 12.7 label · **5.77** boundary |
| `ghost`       | transparent                  | `#241e19` | `#2f2821` | `--on-surface` | 12.7 label                     |
| `link`        | —                            | underline | —         | `--primary`    | **11.24**                      |

> **The two `outline` boundary numbers above were aspirational until 2026-08-02.** `app/globals.css`
> carried `* { border-color: var(--border) }` **unlayered**, and unlayered CSS beats every `@layer` —
> including the `@layer utilities` Tailwind puts `border-outline` in. So every border-colour utility in
> the app resolved to `--border`, and the `outline` variant's boundary was rendering at the **1.31:1
> light / 1.81:1 dark** decorative hairline it was explicitly written to stop using. The 1.4.11 fix was
> in the source and not on the screen. Moving that rule into `@layer base` restored it — measured
> **4.33 light / 5.33 on card, 5.77 on page** in dark. If a border colour ever "does nothing" again,
> check the cascade layer before the token.

**Focus-visible**, identical for every variant: `outline: 2px solid var(--primary); outline-offset: 2px`.
Measured **5.85 light / 11.24 dark** on the page, **4.77 / 7.54** on the highest surface. Never removed;
never replaced by a colour change alone.

### 8.3 Why hover reduces contrast, and why that is fine

The state layer moves the fill **toward** its label, so contrast drops on every filled button —
`primary` goes 6.05 → 5.04 → 4.62. That is M3's model working as designed, and it is safe **only
because the rest state starts with headroom.** Any new filled variant must therefore be checked at
**pressed**, not at rest. The accent is the tight one: it starts at 5.85 and lands at 4.84, which is
why the accent fill cannot be made any lighter than `#d9798a` without a darker label.

### 8.4 Disabled — a token pair, never `opacity`

v1 used `disabled:opacity-50`, which on a coloured fill produced a white label at **2.16:1** — every
disabled primary and destructive button in the app was illegible.

|       | Fill                          | Label                 | Border              |
| ----- | ----------------------------- | --------------------- | ------------------- |
| Light | `--surface-default` `#f7ebe0` | `--outline` `#867077` | `--outline-variant` |
| Dark  | `--surface-default` `#241e19` | `--outline` `#a08a91` | `--outline-variant` |

> **The rule was stated here and broken nearly everywhere else.** A 2026-08-02 sweep found **eight**
> live `disabled:opacity-*` sites outside the Button primitive, including in `Input` and `Label` —
> the form primitives every screen composes. Worst measured: the RoleToggle's active segment faded
> its sage fill and near-white label together at **1.85:1**, the same class of failure this section
> documents fixing. All are now the token pair. Also removed: a `<li>` that carried `opacity-60` for
> its disabled state under a comment claiming "the label stays at full strength" — container-level
> opacity fades every descendant, including the one line explaining _why_ the row was inert.
>
> **The line is persistence, not the property.** `opacity` for a **transient pending** state (a
> reaction pill dimming for the ~200ms of its own write) is fine and is not what this rule is about;
> a token pair there would flash a colour change on every tap. The rule governs states a member can
> sit and look at.

Plus `cursor: not-allowed`, `aria-disabled="true"`, and — where the reason isn't obvious — text saying
what is missing. A dead control explains nothing.

**Loading** keeps the live colours (it is working, not unavailable): spinner replaces the leading icon,
label stays, **width does not change**, `aria-busy="true"`, pointer events off.

### 8.5 Buttons — sizes

| Size      | Painted | Tap target                      | Use                                       |
| --------- | ------- | ------------------------------- | ----------------------------------------- |
| `sm`      | 36px    | **44px** via `tap-area-44`      | Dense rows, headers, inline actions       |
| `icon-sm` | 36×36   | **44×44** via `tap-area-44-box` | Icon-only, paired with `sm`               |
| `md`      | 44px    | 44px                            | Default — dialogs, page CTAs              |
| `icon`    | 44×44   | 44px                            | Icon-only, paired with `md`               |
| `inline`  | auto    | **none, deliberately**          | A control inside running text; use `link` |

> **`lg` (52px) was removed, 2026-08-02.** It was used **zero** times in the app — only in the
> `/designsystem` gallery — after months of development. A rung nothing reaches for is not a size, it
> is an unused option, and an unused _larger_ one is "some buttons are too big" waiting for the next
> person to find it. Two weights cover every context this app actually has: `sm` for dense rows and
> headers, `md` for dialog actions and page CTAs. If a screen ever genuinely needs a heavier primary
> action, add the rung back **and use it** — don't leave it lying around.
>
> The audit that found it also found only **one** call site fighting the scale: the count screen's
> "Edit count" was `size="sm"` with an `h-11` override to match its 44px `size="icon"` sibling — the
> Group header's mismatch again, papered over at the call site instead of fixed by picking the right
> rung. It is now `md`.

**The text size and its icon square are a PAIR — `icon-sm` with `sm`, `icon` with `md`.** Mixing them
was the app's most visible size defect: the Group header put a 36px `sm` button beside a 44px `icon`
button in the same row, an 8px step between two adjacent controls. If you place an icon button next to
a text button, they take matching sizes or the row looks broken.

Icon-only **requires `aria-label`**.

44px is the Apple HIG floor; Material asks 48dp. The two tap utilities differ, and the difference
matters:

- `tap-area-44` expands **vertically only**, spanning the element's own width. Correct for a text
  button that is already wide enough and merely short — horizontal expansion there would eat into the
  8px gap between side-by-side controls and steal a neighbour's taps.
- `tap-area-44-box` centres a 44×44 box on the control, because a 36px **square** is under the floor on
  _both_ axes and `tap-area-44` would leave it 36px wide. Its 4px-per-side overhang exactly meets a
  neighbour's at the midpoint of a standard 8px gap, so it never overlaps.

`inline` is the one size with no tap target, on purpose: a word inside a paragraph cannot carry a 44px
box without shifting the line. It exists so inline controls stop being hand-rolled `<button>`s — before
it, every size forced a height and padding, which made the `link` variant unusable in prose.

### 8.6 Buttons — anti-patterns

| Don't                                             | Because                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Two `accent` buttons in one view                  | The budget is one; the second cancels the first                                                                                    |
| `destructive` as the default focus in a confirm   | The safe path is the default                                                                                                       |
| Icon-only with no `aria-label`                    | Unnameable to a screen reader, untestable by role+name                                                                             |
| A changing name **and** `aria-pressed`            | "Sound off, not pressed" — a double negative. Pick one                                                                             |
| `opacity` to quieten any variant                  | Use the variant that is already quieter                                                                                            |
| A destructive action distinguished only by colour | Accent and danger are 31° apart (§3.1)                                                                                             |
| A bare `<button className="text-primary">`        | Opts out of the edge, focus ring, tap target, disabled pair and pressed state. Use `outline`, or `link` + `size="inline"` in prose |
| `disabled:opacity-*` on a hand-rolled control     | The same 2.16:1 bug §8.4 fixed in the primitive, reintroduced locally                                                              |
| `size="icon"` beside `size="sm"`                  | An 8px height step in one row. Pair `icon-sm` with `sm`                                                                            |
| `ghost` alone on a surface                        | No resting fill and a transparent edge — it reads as background. `outline` is the standalone quiet tier                            |

### 8.7 Inputs and fields

| Part               | Token                                              | Floor                                                      |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| Boundary           | `--outline`                                        | **≥3:1** — v1 used a 1.31:1 hairline and **failed 1.4.11** |
| Fill               | `--surface-default`                                | —                                                          |
| Label              | `--on-surface`                                     | 4.5:1                                                      |
| Placeholder / hint | `--on-surface-variant`                             | 4.5:1                                                      |
| Focus              | 2px `--primary` border + `--primary` ring          | 3:1                                                        |
| Invalid            | `--danger` border + **text in `aria-describedby`** | never colour alone                                         |

Every input is wrapped in `<Field>` (label, hint, error). **A placeholder is not a label.** An error
belongs in `aria-describedby` — v1's goals dialog announced the floor and never the refusal.

### 8.8 Chips, badges and status

Always a `container` / `on-container` pair — never a fill at reduced alpha with a mid-tone label
(v1's "1 freeze left" chip measured **3.28:1** at 12px).

| Status   | Light                            | Dark                            | Glyph |
| -------- | -------------------------------- | ------------------------------- | ----- |
| Complete | `#d0ebd6` / `#0e2013` — **13.4** | `#12542c` / `#d0ebd6` — **7.1** | ✓     |
| At risk  | `#f4e0c1` / `#261903` — **13.3** | `#603f00` / `#f4e0c1` — **7.4** | ⚠     |
| Error    | `#fed9cd` / `#2b150d` — **13.2** | `#742e14` / `#fed9cd` — **7.5** | ✗     |
| Info     | `#d7e4f2` / `#141c25` — **13.5** | `#2f4963` / `#d7e4f2` — **7.4** | i     |

`rounded-full`, `shrink-0` so a long neighbouring name cannot squash it.

#### The accent budget is real — audit it per SCREEN, not per component

D25 rations the accent to **one earned action or celebration per view**. Each component that reached
for it looked defensible on its own; together they blew the budget. A 2026-08-02 audit of the Members
screen found **three** rose elements and **not an action among them**:

| Was rose            | Why it wasn't an action                                   | Now                                                                                  |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Streak chip         | A **state** you are in, and permanent on Today + Progress | `primary` — sage already means growth/continuity                                     |
| `owner` role badge  | A **role**, neither earned nor an action                  | `primary`; `co-admin` drops to `outline`, so roles read as one hierarchy             |
| Standings "you" row | **Identity**                                              | `--primary-container`, the same token the nav's active pill uses for "where you are" |

That left rose for what D25 actually reserves it for: an accent button, and celebration. An accent
seen on every row stops being emphasis and becomes decoration — which is the failure mode, not the
hue.

**Use the container ROLE, not a ramp step, whenever the element contains theme-aware text.** The
standings row was first written as `bg-primary-100`; ramp steps are fixed values that do not flip with
the theme, and that row's children carry `text-foreground`, so on dark it would have put near-white
text on a light sage fill. `--primary-container` is a pair and flips. Measured on it: foreground
**13.48** light / **7.02** dark, muted-foreground **7.45** / **5.29**.

### 8.9 Progress — the signature

| Part                      | Token                             | Floor                                          |
| ------------------------- | --------------------------------- | ---------------------------------------------- |
| Track                     | `--progress-track`                | **≥3:1 on card _and_ page — and stay near it** |
| Fill                      | `--primary` → `--success` at 100% | 3:1                                            |
| Mark (the circle's share) | `--progress-mark`                 | ≥3:1 **on the arc, not the page**              |

- **The track is warm, never grey.** At 3:1 the fill/track _luminance_ gap is small, so the arc is
  carried by the **hue** gap. A grey track at 3:1 turns the ring into one flat donut.
- **3:1 is a floor, not a target — overshoot it and an EMPTY bar reads as a full one.** The first v3
  pass put the track on `--outline` (4.48:1 light, 5.33:1 dark) and the 0% consistency band rendered
  as a solid slab directly beneath the label "0%". Overshooting also collapses the ratio that
  actually matters for a bar, fill-vs-track, to 1.35:1 — the filled part stops being tellable from
  the empty part. `--progress-track` is now its own token on the neutral (tan) ramp, held near the
  floor: 3.18/3.08 light and 3.06/3.31 dark, with fill-vs-track back to 1.90 and 3.40.
- **The track is an outline, never a solid band (D72).** A bar is `ring-1 ring-inset` of the token, and a ring draws it at a quarter of the arc's width. Measured contrast was never enough: at 3:1, a solid track at 0% still looked like a finished bar in the wrong colour. Only progress is solid.
- **Never thin the track with alpha.** Both hero rings independently "receded" it to 60% in v1, so the
  ring you stare at for a whole session had the faintest track in the app.
- **`--progress-mark` inverts between themes** — it is judged against the arc it is drawn on, not the
  page. Reusing the light recipe on dark measured 2.10:1 on primary and 1.59:1 on success: the mark
  vanished exactly when the ring was doing well.
- `ProgressRing`'s `size` is an **inline** width/height — no `className` overrides it. To scale to a
  parent pass **`fluid`**, never `h-full w-full`.

### 8.10 The resting / inactive pattern

A task not due today, a circle you're not in. **Quiet is not absent** — v1's resting card measured
**1.01:1 against the page** and disappeared.

| Part   | Light                     | Dark                   | Measured                          |
| ------ | ------------------------- | ---------------------- | --------------------------------- |
| Fill   | `--surface-low` `#fdf2e7` | `#1f1b16`              | recessed, still a surface         |
| Border | `--outline`, **dashed**   | `--outline`, dashed    | **4.33 / 5.77** (was 1.23 / 1.04) |
| Text   | `--on-surface-variant`    | `--on-surface-variant` | **8.07 / 9.61**                   |
| Shadow | none                      | none                   | flat = not raised                 |

**The border does the work, not the fill.** A recessed surface should be quiet; what makes it legible
as a _thing_ is a boundary at the 3:1 floor. v1 had a near-invisible fill _and_ a near-invisible border.

- **Show, never hide.** A resting task keeps its card and stays tappable.
- **No empty progress bar** — a 0% bar on something nobody asked you to do reads as "you are behind."
  Show the fact instead: "2d", "Due in 2 days · every 3 days".
- **Dashed, not faded.** Dashes say "not active now"; opacity says "broken".
- Never apply it to a day _before_ a task existed — those are offered normally.

### 8.11 Navigation

**One definition, two layouts.** The bottom bar and the sidebar share `navItemVariants`
(`components/app/nav-item-variants.ts`) and differ only by `layout: "stack" | "row"`. They used to be
styled independently, which is why they had no coordination: the sidebar gave the active item a filled
pill, the bottom bar gave it a 2px hairline, and neither had a visible hover or pressed state.

| Part          | Token                                                       |
| ------------- | ----------------------------------------------------------- |
| Surface       | `--chrome`                                                  |
| Active item   | `--primary-container` pill + `--on-primary-container` label |
| Inactive item | `--muted-foreground`                                        |
| Hover         | `--chrome-hover`                                            |
| Pressed       | `--chrome-active`                                           |

> **Nav state layers come from the CHROME pair, never `--surface-*`.** `--surface-active` is
> byte-identical to `--chrome` in **both** themes (`#f3e6da` light, `#110e0b` dark) — measured at a
> contrast ratio of **1.000** against it. So the obvious `active:bg-surface-active` was a literal
> no-op: pressing a nav item changed nothing on screen, which is the mechanical reason the nav could
> not signal it was pressable. `--chrome-hover` / `--chrome-active` are the same 8%/12% M3 recipe taken
> over `--chrome`, measured at **1.166 / 1.262** light and **1.176 / 1.302** dark.

The active fill is the `--primary-container` **token**, not `bg-primary/10`: an alpha over chrome
resolves to a different colour in each theme and can never be measured once. Measured **13.34:1** label
on pill (light) and **7.15:1** (dark).

The pill is a `motion.span` with a shared `layoutId`, so it glides between tabs. It sits at `-z-10`
under the label, and the item therefore carries **`isolate`** — without its own stacking context a
negative z-index escapes and the pill paints _behind_ the nav's own `bg-chrome`, rendering as nothing
at all.

**The administration workspace has its own bar** (`components/app/admin-tab-bar.tsx`, D74). It replaces
the member's tabs on `/admin/*`, and on `/programme/*` for an organiser, so the frame itself says you
have left the member's app. Tabs: Roadmaps, Organisers, then Circles behind a rule as the way out. On
desktop the sidebar swaps its items and keeps `--chrome`.

| Part          | Token                                                  |
| ------------- | ------------------------------------------------------ |
| Surface       | `--admin-chrome`                                       |
| Active item   | `--admin-chrome-pill` + `--on-admin-chrome-pill` icon  |
| Active label  | `--admin-chrome-foreground`                            |
| Inactive item | `--admin-chrome-muted`                                 |
| Hover/pressed | `--admin-chrome-hover` / `--admin-chrome-active`       |
| Focus ring    | `--admin-chrome-foreground`. `--ring` vanishes on sage |

Active state is **never colour alone** — the pill and the heavier icon stroke carry it too.
`aria-current="page"` on the active link.

### 8.12 Segmented controls and toggles

> **The thumb is always exactly one tier above its track, in both themes.**

|       | Track                         | Thumb                                      |
| ----- | ----------------------------- | ------------------------------------------ |
| Light | `--surface-default` `#f7ebe0` | `--surface-lowest` `#fffdf4` + `shadow-sm` |
| Dark  | `--surface-default` `#241e19` | `--surface-highest` `#3e3227`              |

- Track carries `--outline-variant`; thumb carries `--outline`.
- `role="radiogroup"` + `role="radio"` + `aria-checked`. Segments ≥44px tall.
- The thumb slides, it does not fade — `--duration-base` / `--ease-brand`, suppressed on first paint so
  a dark reload doesn't animate across.
- **A binary control does not need to spell out both options at full width.** Constrain it to its
  content; a two-segment pill filling a sidebar is a control shouting a small fact.
  _This rule was written before the code obeyed it._ The theme control shipped in the sidebar foot as
  `w-full` — a 224px labelled pill for one preference — until 2026-08-02. The sidebar now takes
  `ThemeToggleButton`, a single `outline` `icon-sm` button whose **name** carries the change
  ("Switch to dark theme", so no `aria-pressed` — §8.6). The labelled radiogroup stays on `/profile`,
  where a preference deserves its options named, and its shell now matches `Segmented` exactly (same
  radius, track, thumb token, padding). The two were the same control drawn twice, differing only by
  accident — `rounded-full` vs `rounded-xl`, `bg-elevated` vs `bg-card`. Their **semantics** stay
  different on purpose: radiogroup for a preference, tablist for in-page views.

### 8.13 Cards, dialogs, menus

|                | Surface               | Border              | Elevation                          |
| -------------- | --------------------- | ------------------- | ---------------------------------- |
| Card           | `--surface-lowest`    | `--outline-variant` | light `shadow-sm` · dark tone only |
| Dialog         | `--surface-highest`   | `--outline-variant` | light `shadow-xl` · dark tone only |
| Menu / popover | `--surface-highest`   | `--outline-variant` | light `shadow-md` · dark tone only |
| Scrim          | `rgb(31 27 22 / 0.4)` | —                   | —                                  |

**A modal never exceeds the viewport:** capped at `calc(100dvh - 2rem)`, flex column, header and
actions pinned, only the body scrolls (`min-h-0` on the scroll child, or the cap silently does
nothing). Any async work that disables the dialog's controls goes in `try/finally`, and `onClose`
stays live throughout.

**A modal is never un-closable — and that means a VISIBLE control, not a dismiss gesture.** This
sentence used to end at "never un-closable" and the app violated it for months, because the cap above
is a _layout_ rule and says nothing about what actually dismisses the thing. Count the exits on a
phone:

| Exit            | On a phone                                                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESC             | Needs a hardware keyboard. There isn't one.                                                                                                                                                                                              |
| Click-outside   | The card is `max-h-[calc(100dvh-2rem)]` inside a `p-4` container, so a full-height dialog leaves a **~16px sliver** of backdrop top and bottom — under the 44px floor, and beside a scrolling body it reads as scroll, not as "outside". |
| A footer button | Only if the caller passed a `footer`. Two didn't.                                                                                                                                                                                        |

So `Dialog` renders a close button in its header **unconditionally** — it is not a prop, not
`showClose`, and not the caller's to opt into, because the two surfaces that needed it most are
exactly the two that would have forgotten. It is `ghost` + `icon-sm` (36px painted, **44px tappable**
via `tap-area-44-box`), lives outside the scroll container and is `shrink-0`, so it stays on screen
however long the body gets.

> **The lesson generalises past dialogs:** when a primitive's safety property depends on every caller
> remembering a prop, it is not a property — it is a convention, and conventions lose. Put it in the
> primitive. `MemberBreakdownDialog` (the admin logger) is the proof: it is the tallest surface in the
> app, so it ate the most backdrop, and it passed no footer, so it had **no exit at all** once opened
> on a phone.

**Pin it with a test that a wrong implementation fails.** The e2e check clicks _below_ the painted
36px button, inside the 44px overhang — one click that asserts both that the control exists and that
it is a real thumb target. It was mutation-checked in both directions: deleting the button fails it,
and keeping the button while killing the overhang (`after:hidden`) fails it too. A test that only
asserted `toBeVisible()` would have passed the second mutant and told you nothing about whether a
thumb can hit it.

### 8.14 Marks — drawn icons, and the one emoji exception

**Every mark in this app is a drawn icon from `components/app/icons.tsx`** — 24×24, 2px stroke, round
caps, `currentColor`. Colour therefore arrives from a text token like everything else, and the mark
honours light/dark, hover, disabled and the contrast contract in §7 without being told.

**An emoji cannot do any of that.** It is rendered by the OS, in the OS's own font and its own fixed
colours, on top of a token contract that exists precisely so colour is never out of the app's hands.
It also changes shape per platform, so a spec'd layout is a guess. That is why the rule is "no emoji"
and not "prefer icons", and why it reaches past `.tsx` strings into **DB seeds and push
notification bodies** too. Nothing in lint catches it; it is a review rule.

**The single exception is peer reactions (D68):** 🤲 ✨ ❤️ 🔥, defined as `glyph` on `REACTIONS` in
`lib/retention.ts` and rendered in `components/app/peer-reactions.tsx`.

|                     | An icon                         | A reaction                                |
| ------------------- | ------------------------------- | ----------------------------------------- |
| What it is          | A mark standing in for a thing  | **The message itself**                    |
| Who authored it     | Us                              | The sender, choosing between four         |
| Should it be themed | Yes — it belongs to the surface | No — it belongs to the person who sent it |

An outline `HeartIcon` inside a pill reads as _a button you press_. A ❤️ reads as _a heart somebody
sent you_. The vocabulary is already universal because every messaging app taught it, and re-drawing
it throws that away for nothing. `def9314` swept these four in with everything else; the owner's
verdict on the result was "weird icons".

**Do not grow the exception, and do not sweep it back.** It is written in four places on purpose —
here, `CLAUDE.md`, STATUS §4, and decision D68 — plus an assertion in `retention.spec.ts` that the dua
pill contains its glyph, because prose alone already failed once. A future sweep breaks a test.

**When you swap a glyph for a stroke, re-tune what surrounded it.** Emoji sizing (`text-2xl`),
`grayscale` and low `opacity` were all tuned for a solid coloured glyph and are wrong for a 2px
stroke — that is a separate defect this repo has already paid for. In the other direction, an emoji's
line box is taller than a Latin one, so it needs `leading-none` or it pushes its row off the baseline.

---

### 8.15 Rows and rings that act (D72)

A row that opens something, a level heading that collapses and a ring that counts are bare `<button>`s
with their own classes. `Button` is built for a labelled control and would fight each of these shapes.
This is the exception to §8.1, and it holds only if the element keeps what the primitive guarantees:
a visible focus ring, a 44px target and a pressed state. Anything shaped like a button still uses `Button`.

| Pattern               | Rule                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ring that counts      | Today's due rings only. Shows the count, not a percentage, because one tap must visibly change it. A small "+" says it is a button. `touch-action: manipulation` stops double-tap zoom |
| Closed ring           | Inert, never a link, so a fast extra tap cannot overshoot or navigate                                                                                                                  |
| Reorder               | A mode switched on per category, so arrows do not take width from every title                                                                                                          |
| Long lists of toggles | Rows keep their order when toggled, so the row under a thumb never moves                                                                                                               |
| Destructive confirm   | Only where people lose something at once (withdrawing a live roadmap). Reversible toggles do not ask                                                                                   |

**Role badges:** owner is `primary`, co-admin is `outline`, member is unmarked. Never `accent`: rose is for earned moments.

### 8.16 What stops this looking generated (2026-11-04)

The phone PWA is the product, so judge every screen at 390px first. These rules came out of a phone-first pass with the Impeccable, Taste and motion skills.

| Rule                                                             | Instead of                                                           | Where                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------- |
| A card has one elevation cue: a hairline. Radius is `rounded-xl` | Border plus soft shadow on every card                                | `cardVariants`       |
| Rows of the same thing are one list with dividers on phones      | A stack of separate cards                                            | Today's rings        |
| A figure appears in one place, plus at most one supporting line  | Ring, bar, text and button all repeating one number                  | Today's rows         |
| A screen's main number is type on the page                       | Gradient card, icon tile, uppercase label and pill                   | `HeroCard`           |
| Labels are sentence case                                         | Wide-tracked capitals above headings                                 | `Eyebrow`, day strip |
| The active tab's pill sits behind the icon                       | A filled block around icon and label                                 | Bottom nav           |
| A scrim is a flat tint                                           | `backdrop-blur`                                                      | Dialog, celebration  |
| Status dots only mark a real, changing state, and never pulse    | Decorative pulsing dots                                              | Today, Group         |
| Sentences use full stops and commas                              | Em dashes in visible copy (placeholders for missing values are fine) | Everywhere           |

**Motion follows frequency.** A count tap happens hundreds of times a session, so it gets one small answer: the number at 1.06 scale, the arc at `--duration-fast`, and the haptic. No ripple and no glow. Buttons press to `scale(0.97)`. Confetti is sage and rose only and falls behind the card, never across its words.

**A control must look like a control at rest.** A phone has no hover, so anything revealed by hover is invisible to most members (owner, 2026-11-04: "better visual cues for functionality", app-wide).

| If it...                   | It must have...                                                                               | Example                        |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| Opens a menu               | An edge, a surface and a solid chevron                                                        | `GroupSwitcher`                |
| Is a button                | A visible edge or fill at rest. `ghost` keeps a hairline                                      | Remove, Edit                   |
| Is a tappable row          | A chevron, plus a pressed state                                                               | Profile rows, roadmap hub      |
| Is an icon on its own      | A word beside it, unless the icon is universal (back, close, chevron)                         | Group's Manage                 |
| Is a toggle                | An off state with a visible body and a 44px target                                            | Reminder switch                |
| Does something non-obvious | One plain line saying so                                                                      | Today's ring hint              |
| Is NOT pressable           | No button shape. Status pills stay small and never stand alone as the only way to read a fact | Locked badges are dashed slots |

A dashed edge means an empty slot, or a place to add something. Don't use it to box a note. A link inside a sentence is underlined, because colour alone doesn't say it can be pressed. A dialog card takes focus for screen readers but shows no ring, which is set inline in `dialog.tsx`. Segmented thumbs use `bg-elevated`, because `bg-card` nearly vanishes on the dark track.

Hiding a `buttonVariants` element needs `cn(buttonVariants(...), "hidden sm:inline-flex")`. Passed as its `className` option, `hidden` loses to the base `inline-flex`.

**Colour has four jobs (2026-11-04).** The swatches did not change. How they are spent did.

| Colour | Its job                                         | Where                                                                                  |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sage   | Interaction, selection, progress                | `tonal` buttons, the circle switcher, tab pill, rings                                  |
| Tan    | Structure                                       | Hairlines (`--border`), interactive edges (`--outline`, `--input`), wells, the tab bar |
| Plum   | Secondary text only                             | `--muted-foreground`                                                                   |
| Rose   | The one earned action per view, and celebration | `accent`                                                                               |

**Pick a button by what it does:**

| Variant   | Use for                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `accent`  | The one earned action in a view                                                |
| `primary` | A form's confirm                                                               |
| `tonal`   | The everyday secondary action: opens, adds or moves forward                    |
| `outline` | A neutral way out, or a choice that needs weighing: Cancel, Sign out, Withdraw |
| `ghost`   | A quiet action inside a row: Edit, Remove                                      |

Ring and bar tracks are a grey sage, so a ring reads as one family. Measured values are beside each token in `globals.css`.

**Browser surfaces are themed** in `globals.css`: tap highlight, `touch-action`, selection and caret.

## 9. Typography

| Role                              | Face                  | Sizes                 | Treatment                                      |
| --------------------------------- | --------------------- | --------------------- | ---------------------------------------------- |
| Display — headings, counts, brand | `--font-display`      | `text-2xl`–`text-5xl` | `font-semibold`, tight leading, `tabular-nums` |
| Body / UI                         | `--font-sans` (Geist) | `text-sm`–`text-lg`   | `font-normal` / `medium`                       |
| Data                              | `--font-sans`         | `text-xs`–`text-sm`   | `tabular-nums` always                          |

- **`tabular-nums` on anything that changes in place** — counts, streaks, percentages. Without it,
  digits jitter on every tap, which on the count screen is the whole experience.
- **Sentence case everywhere.** An eyebrow may use uppercase via `tracking-wide` + `text-transform`,
  and its **DOM text stays sentence case** — Playwright computes accessible names from DOM text, so a
  cell reading "TODAY" via CSS matches `/Today/`, never `/TODAY/`.
- **One display face per view.** Body never borrows it.
- Prose line length caps at ~72ch.

---

## 10. Spacing, radius, motion

4px base. **Rhythm comes from the layout primitives** — v1's advisory scale drifted to **58 distinct
steps** because nothing owned the decision.

| Primitive           | Job                                                     |
| ------------------- | ------------------------------------------------------- |
| `<Screen>`          | Page wrapper — one column, one rhythm, `px-5 pt-6 pb-8` |
| `<Stack>` / `<Row>` | Vertical / horizontal rhythm, `gap-0/1/2/3/4/5/6`       |
| `<Grid>`            | Columns keyed to its **own slot** via container queries |

- Card padding ladder: `compact|md|lg` → `p-4 / p-6 / p-8`.
- **Radii:** `sm`6 `md`8 `lg`12 `xl`16 `2xl`24 `3xl`32. Buttons `lg`, cards `2xl`, pills `full`.
- **A fixed px column is a floor, not a size** — `minmax(floor, 1fr)` + `min-w-max`, never a fixed
  track, or the layout keeps the phone's size on a 4K monitor. A cell that may widen can't be
  `aspect-square`.
- **Any flex child that must shrink needs `min-h-0`.**
- Page width ladder `--container-page`: 64 → 82 → 98 → 118rem at 1400/1700/2100px.

**Page transitions use `--duration-fast` (D72):** tab changes are the most repeated motion in the app.

**Motion:** `--duration-fast|base|slow` = 150/220/360ms. `--ease-brand`
`cubic-bezier(0.22,1,0.36,1)` for routine; `--ease-emphasized` `cubic-bezier(0.16,1,0.3,1)` for earned
moments.

- **No bounce or elastic, anywhere** — not in eases, not in keyframes. Springs stay near-critically
  damped (ζ≈0.98).
- **A celebration marks a transition, never a state.** Fire on the tap that closes the ring; never on
  arriving at one already closed.
- **No stagger-on-load.** Motion on motion.
- Everything no-ops under `prefers-reduced-motion`.
- **Vibration patterns must not lead with `0`**, and haptics are **Android-only** — WebKit has never
  implemented `navigator.vibrate`.

---

## 11. The token contract

> **Every UI value comes from a design token.**

1. **Token-backed utility** — `bg-primary`, `text-on-surface`, `p-4`, `rounded-lg`.
2. **`var(--token)`** — inline `style`, SVG `fill`/`stroke`/`stopColor`, arbitrary properties.

**Forbidden:** raw colour in `.ts`/`.tsx` — an ESLint error. Magic spacing (`p-[13px]`).

**Sanctioned literals:** `lib/brand.ts` only — platform APIs that cannot read CSS variables.

**Four rules, each a bug already paid for:**

- **Never reference a fill without its `on-` pair.**
- **Never thin a token with alpha to make it quieter.** Pick the token that is already that value.
- **A colour that must always render lives in a token referenced inline, never in a stylesheet rule**,
  with a `var(x, var(y))` fallback. SVG's initial `fill` is **black** — this repo has lost that bet
  three times.
- **Judge a colour against the surface it is actually drawn on, per theme.**

---

## 12. Enforcement

| Rule                                                      | Catches                         |
| --------------------------------------------------------- | ------------------------------- |
| Ban raw hex/`rgb()`/`hsl()` in `.ts`/`.tsx`               | _(already active)_              |
| Ban `neutral-*` / `slate-*` utilities                     | The cool ramp is gone           |
| Ban `opacity-\d+` on anything carrying a background token | The alpha family                |
| Ban `bg-card` in `bottom-nav.tsx` / `sidebar.tsx`         | Chrome borrowing the card token |
| Require an `on-*` class wherever a fill class appears     | Unpaired fills                  |
| Contrast test over §7's pairs, reading `globals.css`      | **Every regression above**      |

The last one matters most: **the token pairs are testable, and this document's numbers are the
fixtures.** A script that parses `globals.css` and asserts §7 turns this spec into a gate rather than a
memo.

**Two rules in this document are already gates, and both are BEHAVIOURAL** — they could not be caught
by parsing a stylesheet, because what they assert is what a thumb can reach and what a person sees:

| Rule                                                       | Pinned by                                                                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| §8.13 — a dialog is closable, by a control a thumb can hit | `e2e/member-shares.spec.ts` — clicks _below_ the painted button, inside the 44px overhang; mutation-checked both ways |
| §8.14 — the four peer reactions are real emoji             | `e2e/retention.spec.ts` — asserts the dua pill contains its glyph                                                     |

Both exist because the rule was previously **prose only**, and prose lost: §8.13 asserted "never
un-closable" while two dialogs had no exit on a phone, and the no-emoji rule did not stop `def9314`
sweeping the reactions. **If a rule here matters, give it a test — and check the test fails when the
rule is broken.** A green test you have never seen fail is a decoration.

---

## 14. Open questions

| #   | Question                                                                                                        | Why it's yours                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2   | **Rose is the accent, and accent sits where danger lives** (§3.1).                                              | Mitigated by depth + the mandatory glyph, but it is a real constraint of the palette you chose |
| 3   | **Sage is lighter than emerald.** Primary tone 40 `#346d3f` is a softer, greyer green — calmer, less assertive. | It changes how "brand" feels, not just how it looks                                            |

---

## 15. Authoring a component

```tsx
const thingVariants = cva("base classes", {
  variants: { variant: { default: "bg-primary text-on-primary" } },
  defaultVariants: { variant: "default" },
});

export function Thing({ className, variant, ...props }: ThingProps) {
  return (
    <div className={cn(thingVariants({ variant }), className)} {...props} />
  );
}
```

- **Always** accept and spread `className` (merged last via `cn`) and `...props`.
- `cva` for ≥2 visual variants; `forwardRef` for focusable elements.
- `"use client"` only when state/effects/handlers are used.
- Export the component + `*Variants` + `*Props`; add to `components/ui/index.ts`.
- **Every fill class ships with its `on-` class.** Tokens only.
- Update `/designsystem` so the living reference stays truthful.
