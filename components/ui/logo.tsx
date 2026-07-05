import * as React from "react";

/**
 * Brand marks. Colours reference design tokens (var(--color-*)) rather than
 * raw hex so they stay on-contract and theme-aware (D14/D20/D25).
 *
 * - AppIconLogo — the emerald rounded-square app icon (gold nalayn silhouette);
 *   use as a hero mark (login, splash).
 * - WebAppLogo — horizontal icon + "Cetele" wordmark; use in headers/navbars.
 */

export function AppIconLogo({ className = "size-24" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Cetele"
    >
      <defs>
        <linearGradient id="ceteleEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-primary-500)" />
          <stop offset="100%" stopColor="var(--color-primary-700)" />
        </linearGradient>
        <linearGradient id="ceteleGold" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-accent-500)" />
          <stop offset="100%" stopColor="var(--color-accent-300)" />
        </linearGradient>
        <filter id="ceteleShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect width="512" height="512" rx="115" fill="url(#ceteleEmerald)" />

      {/* Nalayn silhouette */}
      <path
        d="M256,100 C330,180 350,230 310,290 C280,335 350,390 340,435 C330,470 182,470 172,435 C162,390 232,335 202,290 C162,230 182,180 256,100 Z"
        fill="url(#ceteleGold)"
        filter="url(#ceteleShadow)"
      />
      <path
        d="M256,130 C300,190 320,230 290,280 C260,330 320,380 310,410 C300,430 212,430 202,410 C192,380 252,330 222,280 C192,230 212,190 256,130 Z"
        fill="none"
        stroke="var(--color-primary-700)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export function WebAppLogo({
  className = "h-10 w-auto",
}: {
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 64"
      className={className}
      role="img"
      aria-label="Cetele"
    >
      <defs>
        <linearGradient id="ceteleWordGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-accent-400)" />
          <stop offset="100%" stopColor="var(--color-accent-600)" />
        </linearGradient>
      </defs>

      <g transform="translate(4, 4) scale(0.12)">
        <path
          d="M256,40 C340,130 360,190 310,260 C270,315 360,380 340,440 C320,490 192,490 172,440 C152,380 242,315 202,260 C152,190 172,130 256,40 Z"
          fill="none"
          stroke="var(--color-primary-600)"
          strokeWidth="32"
          strokeLinejoin="round"
        />
        <circle cx="256" cy="180" r="24" fill="url(#ceteleWordGold)" />
        <circle cx="256" cy="270" r="24" fill="url(#ceteleWordGold)" />
        <circle cx="256" cy="360" r="24" fill="url(#ceteleWordGold)" />
      </g>

      <text
        x="72"
        y="42"
        fontSize="32"
        fontWeight="800"
        fill="var(--foreground)"
        letterSpacing="-0.025em"
      >
        Cetele
      </text>
      <circle cx="182" cy="40" r="4" fill="var(--color-primary-600)" />
    </svg>
  );
}
