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
 * Rasterises with the Chromium Playwright already installs (a dev dep), exactly
 * like scripts/gen-icons.mjs — logo.svg has gradients a stdlib rasteriser
 * can't render. Re-run after editing public/logo.svg or the device table:
 *
 *   node scripts/gen-splash.mjs
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { APPLE_DEVICES, splashFiles } from "../lib/apple-splash.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = fs.readFileSync(path.join(root, "public/logo.svg"), "utf8");
const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const CREAM = "#faf6ec"; // matches BRAND_SURFACE_COLOR / --background (light)
const outDir = path.join(root, "public/splash");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

/** Cream canvas at the device's physical pixels, logo centred at ~30% of the
 *  short side — a native-looking, orientation-independent launch mark. */
async function render(w, h) {
  const icon = Math.round(Math.min(w, h) * 0.3);
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();
  await p.setContent(
    `<!doctype html><html><body style="margin:0"><div id="c" style="width:${w}px;height:${h}px;background:${CREAM};display:flex;align-items:center;justify-content:center"><img src="${uri}" style="width:${icon}px;height:${icon}px"></div></body></html>`,
  );
  await p.waitForTimeout(120);
  const buf = await p.locator("#c").screenshot();
  await ctx.close();
  return buf;
}

let n = 0;
for (const d of APPLE_DEVICES) {
  for (const f of splashFiles(d)) {
    fs.writeFileSync(path.join(outDir, f.file), await render(f.w, f.h));
    n++;
  }
}
console.log(`wrote ${n} splash images to public/splash/`);

await browser.close();
