/**
 * Tiny inline icon set for the prototype — no icon dependency. Strokes use
 * `currentColor` so colour always comes from a text token (token contract).
 */
import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

export const TrophyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
    <path d="M10 14.5V18M14 14.5V18M8 21h8M9 21v-1.5h6V21" />
  </svg>
);

export const UsersIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.4M16.5 14.2A5.5 5.5 0 0 1 20.5 19" />
  </svg>
);

export const UserIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const FlameIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.2.4-2 1-2.8C9 9.8 9 8 12 3Z" />
    <path d="M12 21a5 5 0 0 0 5-5c0-2.5-2-3.8-2.5-5C13.7 13 13 14 12 14s-1.5-1-1.8-2C9 13.7 7 14.5 7 16a5 5 0 0 0 5 5Z" />
  </svg>
);

export const SparkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" />
  </svg>
);

export const GridIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

/* Volume on/off. The standard speaker-plus-waves and speaker-plus-cross
   shapes every platform uses, drawn in this set's stroke language so they sit
   with the rest — an emoji renders in the OS's own colour and style, which is
   the one thing a token-driven UI cannot control. */
export const SpeakerOnIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export const SpeakerOffIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="m22 9-6 6" />
    <path d="m16 9 6 6" />
  </svg>
);

/** Concentric rings — the app's own vocabulary for "what I'm aiming at". */
export const TargetIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
  </svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const BellIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const SproutIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20v-8" />
    <path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6Z" />
    <path d="M12 13c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5Z" />
  </svg>
);

export const HeartIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.5-9.5-9A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9Z" />
  </svg>
);

export const AwardIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="9" r="6" />
    <path d="M9 14.5 8 22l4-2 4 2-1-7.5" />
  </svg>
);

/* ---------------------------------------------------------------------------
   The badge catalog + reaction set, drawn rather than emoji'd.

   Every one of these replaced a character that took its colour and its whole
   visual style from the OS's emoji font — the one thing a token-driven UI
   cannot reach, and the reason the speaker toggle was redrawn before them.
   They are deliberately in the same 24/2px stroke language as the rest, so a
   badge tile and a nav icon read as one family.
   --------------------------------------------------------------------------- */

/** A single leaf — "Steadfast". Distinct from `SproutIcon`'s two seed leaves. */
export const LeafIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z" />
    <path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12" />
  </svg>
);

/** A grown tree — "Deeply rooted", the 100-day landmark. */
export const TreeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 19a4 4 0 0 1-2.2-7.3A3.5 3.5 0 0 1 9 6.6a4 4 0 0 1 6.4 0 3.5 3.5 0 0 1 3.3 5.1A4 4 0 0 1 16 19Z" />
    <path d="M12 19v3" />
  </svg>
);

/**
 * A tasbih — "Consistent". The one icon in this set drawn from the practice
 * itself rather than from a generic metaphor: a strand of beads is what a
 * cetele is counted on.
 */
export const BeadsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    {/* Seven beads on the loop, drawn as separate FILLED dots with real gaps.
        The first version laid dots ON a stroked circle: a 3px dot centred on a
        2px stroke overlaps it almost entirely, so at 28px the whole thing
        closed into one notched blob. No strand line — the ring of beads IS the
        strand, and the gaps are what say "beads" rather than "circle". */}
    <circle cx="12" cy="11" r="7" />
    <circle cx="12" cy="4" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="11" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="5" cy="11" r="2.4" fill="currentColor" stroke="none" />
    {/* The imam bead and its tassel. Load-bearing: without them a ring of
        evenly spaced dots is a loading spinner. The beads are much wider than
        the strand on purpose — the first two attempts (dots at r=1.4–1.6, with
        and without the strand) rendered as scattered specks at the 28px the
        badge tile actually uses, reading as a sparkle rather than a tasbih. */}
    <circle cx="12" cy="18" r="2.8" fill="currentColor" stroke="none" />
    <path d="M12 20.8v2.2" />
  </svg>
);

/** A five-pointed star — "Devoted", the rarest badge. */
export const StarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9Z" />
  </svg>
);

/**
 * Two open palms cupped together — the "Dua" reaction.
 *
 * Kept to four strokes on purpose: this renders at 16px inside a reaction pill,
 * and every extra finger turned the shape into a smudge at that size. The
 * silhouette (a bowl, opening upward) is what carries it, not the detail.
 */
export const HandsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    {/* Two palms cupped into a bowl, opening upward, with the seam where they
        meet. The first attempt drew fingers rising out of the middle and read
        as a single raised claw — at 16px the SILHOUETTE is the whole message,
        so the shape is now a wide shallow bowl and nothing else. */}
    <path d="M2.5 11a9.5 9.5 0 0 0 19 0" />
    <path d="M12 20.5V11" />
    <path d="M2.5 11 5 7.4M21.5 11 19 7.4" />
  </svg>
);

/** Dismiss. Replaces a literal ✕, which is a font glyph, not a drawn shape. */
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

/* ---------------------------------------------------------------------------
 * Roadmap marks. A roadmap item is done SOMEWHERE ELSE — a playlist, a book —
 * so its mark has to say "this is a thing out in the world", which is why the
 * set carries a source kind (play/book) and a way out (external link) rather
 * than the counting vocabulary the daily tasks use.
 * ------------------------------------------------------------------------- */

/** A watch item — a video or a playlist. */
export const PlayIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10.3 8.6v6.8L16 12z" />
  </svg>
);

/** A read item — a book, an essay, a wird to be studied. */
export const BookIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 6.8C10.6 5.3 8.6 4.7 4.5 4.7v12.6c4.1 0 6.1.6 7.5 2.1 1.4-1.5 3.4-2.1 7.5-2.1V4.7c-4.1 0-6.1.6-7.5 2.1Z" />
    <path d="M12 6.8v12.6" />
  </svg>
);

/** A reward waiting at a milestone. */
export const GiftIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 8.6h17v3.2h-17z" />
    <path d="M5.2 11.8v8a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1v-8" />
    <path d="M12 8.6v12.2" />
    <path d="M12 8.6S10.7 4 8.6 4a2.3 2.3 0 0 0 0 4.6ZM12 8.6S13.3 4 15.4 4a2.3 2.3 0 0 1 0 4.6Z" />
  </svg>
);

/** Leaves the app — the item itself lives on YouTube, a library, a PDF. */
export const ExternalLinkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11.5 12.5" />
    <path d="M18.5 14.4V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6h4.6" />
  </svg>
);

/** The roadmap itself — a destination, not a daily loop. */
export const FlagIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.8 21V3.4" />
    <path d="M5.8 4.6h11.4l-2.1 3.7 2.1 3.7H5.8" />
  </svg>
);

export const SettingsIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const GoogleIcon = (p: IconProps) => (
  // Brand glyph drawn with currentColor (mono) to respect the token contract.
  <svg {...base({ strokeWidth: 1.8, ...p })}>
    <path d="M21 12.2c0 5-3.5 8.3-8.7 8.3a8.5 8.5 0 1 1 0-17 8 8 0 0 1 5.6 2.2L15.4 8A4.8 4.8 0 1 0 17 13H12.3V9.9H21Z" />
  </svg>
);

export const MailIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
);

export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
  </svg>
);

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);

export const MonitorIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M8 20h8M12 16.5V20" />
  </svg>
);
