import type { Metadata } from "next";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  ProgressRing,
  Spinner,
  Stat,
} from "@/components/ui";
import { RingDemo } from "./ring-demo";
import { AppIconLogo, WebAppLogo } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Design System · Cetele",
  description:
    "Living style guide — tokens and components, themed emerald + gold on warm cream.",
};

/* ---------- small presentational helpers (page-local) ---------- */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="space-y-1.5">
      <div
        className="h-14 rounded-lg border border-border shadow-xs"
        style={{ background: `var(${varName})` }}
      />
      <div className="px-0.5">
        <p className="text-xs font-medium text-foreground">{name}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{varName}</p>
      </div>
    </div>
  );
}

function Scale({ label, prefix }: { label: string; prefix: string }) {
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="grid grid-cols-11 overflow-hidden rounded-lg border border-border">
        {steps.map((s) => (
          <div key={s} className="flex flex-col">
            <div
              className="h-12"
              style={{ background: `var(--color-${prefix}-${s})` }}
            />
            <span className="bg-card py-1 text-center text-[10px] text-muted-foreground">
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TYPE_SCALE = [
  {
    name: "Display / 4xl",
    cls: "font-display text-4xl font-bold",
    note: "2.25rem · headings, hero",
  },
  {
    name: "Display / 2xl",
    cls: "font-display text-2xl font-bold",
    note: "1.5rem · section titles",
  },
  {
    name: "Heading / lg",
    cls: "font-display text-lg font-semibold",
    note: "1.125rem · card titles",
  },
  { name: "Body / base", cls: "text-base", note: "1rem · default body" },
  { name: "Body / sm", cls: "text-sm", note: "0.875rem · secondary, UI" },
  {
    name: "Caption / xs",
    cls: "text-xs text-muted-foreground",
    note: "0.75rem · hints, labels",
  },
];

const SPACING = [1, 2, 3, 4, 6, 8, 12, 16];
const RADII = [
  ["sm", "rounded-sm"],
  ["md", "rounded-md"],
  ["lg", "rounded-lg"],
  ["xl", "rounded-xl"],
  ["2xl", "rounded-2xl"],
  ["full", "rounded-full"],
] as const;
const SHADOWS = [
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
];

const NAV = [
  ["Brand", "brand"],
  ["Colors", "colors"],
  ["Typography", "typography"],
  ["Spacing", "spacing"],
  ["Radii", "radii"],
  ["Elevation", "elevation"],
  ["Buttons", "buttons"],
  ["Badges", "badges"],
  ["Forms", "forms"],
  ["Avatars", "avatars"],
  ["Progress", "progress"],
  ["Stats", "stats"],
] as const;

export default function DesignSystemPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      {/* Header */}
      <header className="mb-12 space-y-3">
        <div className="flex items-center gap-2.5">
          <WebAppLogo className="h-8 w-auto" />
          <Badge variant="outline" size="sm">
            Design tokens
          </Badge>
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
          Design System
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tokens and reusable components for Cetele, themed emerald + gold on
          warm cream. Everything below is driven by the design tokens in{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            app/globals.css
          </code>
          . See{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            docs/DESIGN_SYSTEM.md
          </code>{" "}
          for usage guidelines.
        </p>
        <nav className="flex flex-wrap gap-2 pt-2">
          {NAV.map(([label, id]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className="space-y-16">
        {/* BRAND */}
        <Section
          id="brand"
          title="Brand marks"
          description="The Cetele logo — a green mark with a gold arrow, from public/logo.svg (a fixed-colour brand asset, not theme-token-driven). AppIconLogo is the square hero mark on a light tile (login, splash); WebAppLogo is the horizontal icon + wordmark for headers and the app sidebar. Import from @/components/ui/logo."
        >
          <Card>
            <CardContent className="flex flex-wrap items-center gap-8 pt-6">
              <div className="flex flex-col items-center gap-2">
                <AppIconLogo className="size-20 rounded-[1.25rem] shadow-md" />
                <code className="font-mono text-xs text-muted-foreground">
                  AppIconLogo
                </code>
              </div>
              <div className="flex flex-col items-center gap-2">
                <WebAppLogo className="h-10 w-auto" />
                <code className="font-mono text-xs text-muted-foreground">
                  WebAppLogo
                </code>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* COLORS */}
        <Section
          id="colors"
          title="Colors"
          description="Emerald (primary) is calm, spiritual, and the colour of completion/growth — it owns the surface, chrome, and 'done' states. Gold (accent) arouses — reserved for the single most important action and live progress, so its energy is earned, not background noise. Red is errors only, never urgency/FOMO."
        >
          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              {[
                [
                  "Emerald — primary",
                  "Brand, calm/spiritual, completion & growth. Buttons, chrome, headings, closed rings.",
                  "bg-primary",
                ],
                [
                  "Gold — accent",
                  "Energy. The one CTA per view + progress + celebration. (Dark text for AA contrast.)",
                  "bg-accent",
                ],
                [
                  "Green — success",
                  "Complete / on track. Always paired with a ✓ glyph.",
                  "bg-success",
                ],
                [
                  "Amber — warning",
                  "At risk / attention. Paired with text.",
                  "bg-warning",
                ],
                [
                  "Red — danger",
                  "Errors & destructive actions ONLY. Never FOMO.",
                  "bg-danger",
                ],
                [
                  "Slate — neutral",
                  "Text, borders, muted surfaces.",
                  "bg-neutral-400",
                ],
              ].map(([name, role, dot]) => (
                <div key={name} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 size-4 shrink-0 rounded-full ${dot}`}
                  />
                  <span>
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="text-muted-foreground"> — {role}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            <Swatch name="Primary" varName="--primary" />
            <Swatch name="Accent" varName="--accent" />
            <Swatch name="Background" varName="--background" />
            <Swatch name="Foreground" varName="--foreground" />
            <Swatch name="Muted" varName="--muted" />
            <Swatch name="Border" varName="--border" />
            <Swatch name="Success" varName="--success" />
            <Swatch name="Warning" varName="--warning" />
            <Swatch name="Danger" varName="--danger" />
            <Swatch name="Info" varName="--info" />
            <Swatch name="Ring" varName="--ring" />
            <Swatch name="Card" varName="--card" />
          </div>
          <div className="space-y-5">
            <Scale label="Primary · emerald" prefix="primary" />
            <Scale label="Accent · gold" prefix="accent" />
            <Scale label="Neutral · slate" prefix="neutral" />
          </div>
        </Section>

        {/* TYPOGRAPHY */}
        <Section
          id="typography"
          title="Typography"
          description="Quicksand (rounded, friendly) for display & headings — echoing the wordmark. Geist Sans for body and UI."
        >
          <Card>
            <CardContent className="divide-y divide-border pt-6">
              {TYPE_SCALE.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className={t.cls}>The quick brown fox</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.name} · {t.note}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </Section>

        {/* SPACING */}
        <Section
          id="spacing"
          title="Spacing"
          description="4px base unit (Tailwind scale). Use consistent steps — 1, 2, 3, 4, 6, 8 cover most layouts."
        >
          <div className="space-y-2">
            {SPACING.map((s) => (
              <div key={s} className="flex items-center gap-4">
                <span className="w-16 font-mono text-xs text-muted-foreground">
                  {s} · {s * 4}px
                </span>
                <div
                  className="h-4 rounded bg-accent"
                  style={{ width: `${s * 4}px` }}
                />
              </div>
            ))}
          </div>
        </Section>

        {/* RADII */}
        <Section
          id="radii"
          title="Radii"
          description="Generous, youthful rounding."
        >
          <div className="flex flex-wrap gap-6">
            {RADII.map(([name, cls]) => (
              <div key={name} className="space-y-2 text-center">
                <div
                  className={`size-20 border border-border bg-primary-100 ${cls}`}
                />
                <p className="font-mono text-xs text-muted-foreground">
                  {name}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ELEVATION */}
        <Section
          id="elevation"
          title="Elevation"
          description="Soft, neutral shadows for a clean lift off the cream page. Cards use sm; popovers/menus use md–lg; modals use xl."
        >
          <div className="flex flex-wrap gap-6">
            {SHADOWS.map((s) => (
              <div key={s} className="space-y-2 text-center">
                <div className={`size-24 rounded-xl bg-card ${s}`} />
                <p className="font-mono text-xs text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* BUTTONS */}
        <Section
          id="buttons"
          title="Buttons"
          description="One accent button per view (the primary action). Sizes sm / md / lg + icon."
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="subtle">Subtle</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">Destructive</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Add">
                +
              </Button>
              <Button loading>Saving</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </Section>

        {/* BADGES */}
        <Section
          id="badges"
          title="Badges"
          description="Status, roles, and counts."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Member</Badge>
            <Badge variant="primary">Group Admin</Badge>
            <Badge variant="accent">Admin</Badge>
            <Badge variant="success">On track</Badge>
            <Badge variant="warning">At risk</Badge>
            <Badge variant="danger">Missed</Badge>
            <Badge variant="outline">12 day streak</Badge>
          </div>
        </Section>

        {/* FORMS */}
        <Section
          id="forms"
          title="Forms"
          description="Inputs composed with the Field wrapper for labels, hints, and errors."
        >
          <div className="grid max-w-md gap-5">
            <Field
              label="Group name"
              htmlFor="ds-name"
              hint="Visible to all members."
            >
              <Input id="ds-name" placeholder="e.g. Friday Halaqa" />
            </Field>
            <Field
              label="Invite code"
              htmlFor="ds-code"
              error="That code doesn’t exist."
              required
            >
              <Input id="ds-code" defaultValue="ZX9-22" aria-invalid />
            </Field>
            <Field label="Disabled" htmlFor="ds-dis">
              <Input id="ds-dis" placeholder="Unavailable" disabled />
            </Field>
          </div>
        </Section>

        {/* AVATARS */}
        <Section
          id="avatars"
          title="Avatars"
          description="Image with initials fallback."
        >
          <div className="flex items-end gap-4">
            <Avatar size="sm" name="Mohid Khan" />
            <Avatar size="md" name="Aisha Rahman" />
            <Avatar size="lg" name="Yusuf Ali" />
            <Avatar size="xl" name="Group Lead" />
          </div>
        </Section>

        {/* PROGRESS */}
        <Section
          id="progress"
          title="Progress ring"
          description="The signature component — a dhikr item's ring fills as the count climbs and turns green when the target is reached."
        >
          <div className="flex flex-wrap items-center gap-10">
            <RingDemo />
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-2">
                <ProgressRing value={25} max={100} />
                <span className="text-xs text-muted-foreground">25%</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <ProgressRing value={70} max={100} />
                <span className="text-xs text-muted-foreground">70%</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <ProgressRing value={100} max={100}>
                  <span className="text-xl text-success">✓</span>
                </ProgressRing>
                <span className="text-xs text-muted-foreground">Complete</span>
              </div>
            </div>
          </div>
        </Section>

        {/* STATS */}
        <Section
          id="stats"
          title="Stats"
          description="Big numbers for streaks, group totals, and ranks."
        >
          <Card>
            <CardHeader>
              <CardTitle>Friday Halaqa</CardTitle>
              <CardDescription>Today’s collective dhikr</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-10">
              <Stat
                label="Streak"
                value="12"
                icon={<span>🔥</span>}
                hint="days"
              />
              <Stat label="Group total" value="41,300" hint="/ 100,000" />
              <Stat label="Your rank" value="#3" hint="of 18" />
            </CardContent>
            <CardFooter>
              <Button variant="accent">Open today’s dhikr</Button>
              <Button variant="ghost" leadingIcon={<Spinner />}>
                Syncing
              </Button>
            </CardFooter>
          </Card>
        </Section>
      </div>

      <footer className="mt-20 border-t border-border pt-6 text-xs text-muted-foreground">
        Cetele design system · emerald + gold on warm cream · tokens in{" "}
        <code className="font-mono">app/globals.css</code>, components in{" "}
        <code className="font-mono">components/ui/</code>.
      </footer>
    </div>
  );
}
