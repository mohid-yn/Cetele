#!/usr/bin/env node
/**
 * Generate the iOS PWA launch ("startup") images from the brand mark.
 *
 * iOS standalone ignores the manifest `background_color`, so without these it
 * shows a BLACK screen for the whole cold start. Each image is the logo centred
 * on the cream page surface (so the splash → first-paint hand-off doesn't jump
 * colour), rendered at the device's exact physical resolution. The device list
 * + filenames come from lib/apple-splash.js — the same table the <link> tags
 * read, so they can't drift.
 *
 * Composed with satori and rasterised with resvg, exactly like
 * scripts/gen-icons.mjs, from the mark in scripts/brand-mark.mjs. Re-run after
 * editing the mark or the device table, then bump CACHE in public/sw.js:
 *
 *   node scripts/gen-splash.mjs
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { APPLE_DEVICES, splashFiles } from "../lib/apple-splash.js";
import { markElement } from "./brand-mark.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CREAM = "#f6f9fe"; // matches BRAND_SURFACE_COLOR / --background (light)
const outDir = path.join(root, "public/splash");
fs.mkdirSync(outDir, { recursive: true });

/** Cream canvas at the device's physical pixels, the mark centred at ~30% of
 *  the short side — a native-looking, orientation-independent launch mark. */
async function render(w, h) {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: w,
          height: h,
          background: CREAM,
        },
        children: [markElement(Math.round(Math.min(w, h) * 0.3))],
      },
    },
    { width: w, height: h, fonts: [] },
  );
  return new Resvg(svg).render().asPng();
}

let n = 0;
for (const d of APPLE_DEVICES) {
  for (const f of splashFiles(d)) {
    fs.writeFileSync(path.join(outDir, f.file), await render(f.w, f.h));
    n++;
  }
}
console.log(`wrote ${n} splash images to public/splash/`);
