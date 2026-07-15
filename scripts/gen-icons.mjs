#!/usr/bin/env node
/**
 * Generate the PWA icons + favicon + apple-icon from the brand mark.
 *
 * The mark lives in `public/logo.svg` (gradients + a drop shadow), which a
 * stdlib rasteriser can't render — so this rasterises it with the Chromium that
 * Playwright already installs (a dev dep). Re-run after editing public/logo.svg:
 *
 *   node scripts/gen-icons.mjs
 *
 * Outputs (all static, under public/ — referenced from metadata/manifest, NOT
 * via Next's app/icon file convention, whose ICO/PNG image processing rejects
 * these): public/icons/icon-{192,512}.png, icon-maskable-512.png, and
 * public/apple-icon.png. Each is the mark centred on a white tile (the maskable
 * one carries extra padding for the platform safe zone).
 */
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = fs.readFileSync(path.join(root, "public/logo.svg"), "utf8");
const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const browser = await chromium.launch();
async function render(size, scalePct, bg = "#ffffff") {
  const ctx = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();
  await p.setContent(
    `<!doctype html><html><body style="margin:0"><div id="c" style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center"><img src="${uri}" style="width:${scalePct}%"></div></body></html>`,
  );
  await p.waitForTimeout(120);
  const buf = await p.locator("#c").screenshot();
  await ctx.close();
  return buf;
}

const w = (rel, buf) => {
  fs.writeFileSync(path.join(root, rel), buf);
  console.log("wrote", rel);
};

w("public/icons/icon-192.png", await render(192, 82));
w("public/icons/icon-512.png", await render(512, 82));
w("public/icons/icon-maskable-512.png", await render(512, 64)); // safe-zone padding
w("public/apple-icon.png", await render(180, 82));

await browser.close();
