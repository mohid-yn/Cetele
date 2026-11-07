#!/usr/bin/env node
/**
 * Generate every brand asset except the iOS launch images from the mark in
 * scripts/brand-mark.mjs, composed with satori and rasterised with resvg:
 *
 *   node scripts/gen-icons.mjs
 *
 * Outputs, all static under public/ (referenced from metadata and the
 * manifest, NOT via Next's app/icon file convention):
 *   logo.svg                 the mark alone, blue C + orange bead (favicon, wordmark)
 *   logo-tile.svg            the app icon: white C + orange bead on a blue square
 *   icons/icon-{192,512}.png the app icon as PNG
 *   icons/icon-maskable-512.png  the same tile; the mark sits well inside the
 *                            40% safe-zone circle, so the platform can crop it
 *   apple-icon.png           180 px, for iOS home screens (iOS rounds the corners)
 *
 * The tiles are full-bleed squares: every platform applies its own corner mask.
 * After running, bump CACHE in public/sw.js.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BLUE, ORANGE, WHITE, markElement, markSvg } from "./brand-mark.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const w = (rel, data) => {
  fs.writeFileSync(path.join(root, rel), data);
  console.log("wrote", rel);
};

/** The app icon at `size` px, with the mark at `scale` of the tile. */
async function tileSvg(size, scale = 0.66) {
  return satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          background: BLUE,
        },
        children: [
          markElement(Math.round(size * scale), { ring: WHITE, bead: ORANGE }),
        ],
      },
    },
    { width: size, height: size, fonts: [] },
  );
}
const png = (svg) => new Resvg(svg).render().asPng();

w("public/logo.svg", markSvg());
w("public/logo-tile.svg", await tileSvg(512));
w("public/icons/icon-192.png", png(await tileSvg(192)));
w("public/icons/icon-512.png", png(await tileSvg(512)));
w("public/icons/icon-maskable-512.png", png(await tileSvg(512, 0.6)));
w("public/apple-icon.png", png(await tileSvg(180)));
