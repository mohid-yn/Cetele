import type { MetadataRoute } from "next";
import { BRAND_THEME_COLOR } from "@/lib/brand";

// Generates /manifest.webmanifest — makes Cetele installable as a PWA.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cetele — group dhikr tracker",
    short_name: "Cetele",
    description:
      "Track your daily dhikr together. A shared tally that makes remembrance a habit.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND_THEME_COLOR,
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
