"use client";

/**
 * Celebration layer — the dopamine payoff. A full-screen confetti canvas plus a
 * "variable reward" milestone card, exposed via `useCelebration()`. Both the
 * tap counter (on completion) and Demo Controls (manual trigger) call it.
 *
 * Confetti colours are read from CSS variables at runtime (getComputedStyle),
 * never hardcoded — so the token contract holds even on a <canvas>.
 */

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { prefersReducedMotion } from "@/lib/motion";
import { hapticCelebrate } from "@/lib/haptics";
import { SparkIcon } from "./icons";

interface CelebrateOptions {
  title?: string;
  message?: string;
  /** Skip the milestone card; just burst confetti (e.g. a ring closing). */
  confettiOnly?: boolean;
}

interface CelebrationValue {
  celebrate: (opts?: CelebrateOptions) => void;
}

const CelebrationContext = React.createContext<CelebrationValue | null>(null);

// Variable-reward copy — a surprise du'a / encouragement on milestones.
//
// Only the two sourced lines remain. "Every count is a tree planted for you in
// Jannah" and the "1,000 good deeds" line made specific religious claims nobody
// here could source, and "Barakah unlocked" / "On fire" framed worship as a game.
// Have someone qualified check anything added to this list.
const MILESTONES: { title: string; message: string }[] = [
  {
    title: "MashaAllah",
    message:
      "\u201CThe most beloved deeds to Allah are those done consistently, even if small.\u201D",
  },
  {
    title: "Beautiful",
    message: "\u201CRemember Me, and I will remember you.\u201D (2:152)",
  },
];

function readPalette(): string[] {
  if (typeof window === "undefined") return [];
  const css = getComputedStyle(document.documentElement);
  // Sage and rose only. --warning and --accent-foreground threw brown and
  // near-black squares into a moment that should look like the app.
  return ["--accent", "--primary", "--success", "--primary-container"]
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

export function CelebrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const burstRef = React.useRef<() => void>(() => {});
  const [card, setCard] = React.useState<{
    title: string;
    message: string;
  } | null>(null);

  // The whole confetti engine lives in one effect — local closures avoid the
  // hook ordering/immutability pitfalls of a recursive useCallback.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let raf: number | null = null;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.vy += 0.15; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      particles = particles.filter(
        (p) => p.life > 0 && p.y < canvas.height + 40,
      );
      if (particles.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    burstRef.current = () => {
      // The CSS reduced-motion guard can't reach a raw-canvas rAF loop, and
      // MotionConfig only governs `motion` components — so this is checked here.
      // The milestone card still shows (it's information, and its CSS animation
      // is already neutered by the global guard); only the particles are motion.
      if (prefersReducedMotion()) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const colors = readPalette();
      if (!colors.length) return;
      const originX = canvas.width / 2;
      const originY = canvas.height * 0.42;
      for (let i = 0; i < 70; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        particles.push({
          x: originX + (Math.random() - 0.5) * 60,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4,
          size: 6 + Math.random() * 8,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 60 + Math.random() * 40,
        });
      }
      if (raf == null) raf = requestAnimationFrame(tick);
    };

    return () => {
      if (raf) cancelAnimationFrame(raf);
      burstRef.current = () => {};
    };
  }, []);

  const celebrate = React.useCallback((opts?: CelebrateOptions) => {
    burstRef.current();
    hapticCelebrate();
    if (!opts?.confettiOnly) {
      const pick = MILESTONES[Math.floor(Math.random() * MILESTONES.length)];
      setCard({
        title: opts?.title ?? pick.title,
        message: opts?.message ?? pick.message,
      });
      // NO AUTO-DISMISS, and no timer to tear down. This card is now spent
      // only on the day closing — once a day at most — so a 4.2s countdown
      // would snatch the one moment the app actually stops to mark. It was
      // right while a ring closing raised this too: several a day of that had
      // to clear itself. The member closes it now, with the button below.
    }
  }, []);

  // The card has a button and a backdrop, and a keyboard needs its way out too.
  const cardOpen = card != null;
  React.useEffect(() => {
    if (!cardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCard(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cardOpen]);

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden
        // Same layer as the card and earlier in the DOM, so confetti falls BEHIND
        // it. Above, it was painting across the words it was celebrating.
        className="pointer-events-none fixed inset-0 z-[var(--z-modal)]"
      />
      {card && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-primary-950/30 p-6"
          onClick={() => setCard(null)}
          role="dialog"
          aria-modal
          aria-labelledby="day-card-title"
          aria-live="assertive"
        >
          <Card
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs border-accent-200 p-6 text-center shadow-xl"
            style={{
              animation:
                "celebrate-in var(--duration-slow) var(--ease-emphasized)",
            }}
          >
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-accent-100 text-accent-700">
              <SparkIcon className="size-7" />
            </div>
            <h2
              id="day-card-title"
              className="font-display text-xl font-bold text-foreground"
            >
              {card.title}
            </h2>
            <p className="mt-2 text-sm text-balance text-muted-foreground">
              {card.message}
            </p>
            {/* A REAL CONTROL, not a dismiss gesture. "tap to dismiss" asked
                the member to click the backdrop — which on a phone is whatever
                slice of screen the card leaves, the same trap D68 fixed in
                `Dialog`. The backdrop still closes it; this is what makes that
                discoverable and what a thumb actually reaches for. */}
            <Button
              className="mt-5 w-full"
              autoFocus
              onClick={() => setCard(null)}
            >
              Alhamdulillah
            </Button>
          </Card>
        </div>
      )}
    </CelebrationContext.Provider>
  );
}

export function useCelebration(): CelebrationValue {
  const ctx = React.useContext(CelebrationContext);
  if (!ctx)
    throw new Error("useCelebration must be used within <CelebrationProvider>");
  return ctx;
}
