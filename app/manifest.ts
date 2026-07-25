import type { MetadataRoute } from "next";
import { BRAND_THEME_COLOR, BRAND_SURFACE_COLOR } from "@/lib/brand";

// Generates /manifest.webmanifest — makes Cetele installable as a PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cetele — group dhikr tracker",
    short_name: "Cetele",
    description:
      "Track your daily dhikr together. A shared tally that makes remembrance a habit.",
    // The real destination, NOT `/` — `/` is the login page, so a signed-in
    // launch there always has to redirect, and a redirecting start_url means a
    // bodyless hop (nothing painted) on every cold start. `/today` resolves the
    // member's circle directly; a signed-out launch is gated to login from here.
    start_url: "/today",
    display: "standalone",
    orientation: "portrait",
    // The splash canvas (Android/desktop) = the page surface, so the splash →
    // first-paint hand-off doesn't jump colour. Brand emerald stays the chrome
    // `theme_color`, not the background.
    background_color: BRAND_SURFACE_COLOR,
    theme_color: BRAND_THEME_COLOR,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
