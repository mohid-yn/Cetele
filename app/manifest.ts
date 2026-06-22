import type { MetadataRoute } from "next";

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
    background_color: "#1f7a5a",
    theme_color: "#1f7a5a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
