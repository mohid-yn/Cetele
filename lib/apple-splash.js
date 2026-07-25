// @ts-check
/**
 * Apple standalone-PWA launch ("startup") images.
 *
 * iOS ignores the manifest `background_color`, so `apple-touch-startup-image`
 * link tags are the ONLY way to cover its black cold-start screen: one image
 * per device size AND orientation, each matched by an exact media query, or iOS
 * falls back to black. (Android/desktop use the manifest instead — see
 * app/manifest.ts.)
 *
 * This table is the single source of truth. Both the generator
 * (`scripts/gen-splash.mjs`) and the <link> metadata (app/layout.tsx) read it,
 * so they can never drift. Regenerate the PNGs after editing this table or the
 * logo:  `node scripts/gen-splash.mjs`.
 */

/** @typedef {{ dw: number, dh: number, ratio: number }} Device */
/** @typedef {{ w: number, h: number, orientation: "portrait" | "landscape", file: string }} SplashFile */

/**
 * Portrait CSS-point dimensions + device-pixel-ratio for every current
 * iPhone/iPad, deduped by media query (many models share a screen). Add a row
 * when Apple ships a new size; the generator and metadata pick it up for free.
 * @type {Device[]}
 */
export const APPLE_DEVICES = [
  // iPhones
  { dw: 375, dh: 667, ratio: 2 }, // SE 2/3, 8, 7, 6s
  { dw: 414, dh: 736, ratio: 3 }, // 8+, 7+, 6s+
  { dw: 375, dh: 812, ratio: 3 }, // X, XS, 11 Pro, 12/13 mini
  { dw: 414, dh: 896, ratio: 2 }, // XR, 11
  { dw: 414, dh: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { dw: 390, dh: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { dw: 428, dh: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { dw: 393, dh: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { dw: 430, dh: 932, ratio: 3 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { dw: 402, dh: 874, ratio: 3 }, // 16 Pro
  { dw: 440, dh: 956, ratio: 3 }, // 16 Pro Max
  // iPads
  { dw: 768, dh: 1024, ratio: 2 }, // mini, 9.7", Air
  { dw: 810, dh: 1080, ratio: 2 }, // 10.2"
  { dw: 834, dh: 1112, ratio: 2 }, // Air/Pro 10.5"
  { dw: 820, dh: 1180, ratio: 2 }, // 10.9", Air 4/5, 10th gen
  { dw: 834, dh: 1194, ratio: 2 }, // Pro 11", Air 11" M2
  { dw: 1024, dh: 1366, ratio: 2 }, // Pro 12.9"
  { dw: 1032, dh: 1376, ratio: 2 }, // Pro 13" M4
];

/**
 * The two orientation variants one device needs, with the physical-pixel
 * dimensions the generator renders and the filename both sides agree on.
 * @param {Device} d
 * @returns {SplashFile[]}
 */
export function splashFiles(d) {
  const pw = d.dw * d.ratio;
  const ph = d.dh * d.ratio;
  return [
    {
      w: pw,
      h: ph,
      orientation: "portrait",
      file: `apple-splash-${pw}-${ph}.png`,
    },
    {
      w: ph,
      h: pw,
      orientation: "landscape",
      file: `apple-splash-${ph}-${pw}.png`,
    },
  ];
}

/**
 * `{ url, media }` entries for Next's `appleWebApp.startupImage` metadata. Per
 * Apple's convention device-width/height stay at the portrait point values and
 * only `orientation` flips; the image itself swaps to landscape dimensions.
 * @type {{ url: string, media: string }[]}
 */
export const appleStartupImages = APPLE_DEVICES.flatMap((d) =>
  splashFiles(d).map((f) => ({
    url: `/splash/${f.file}`,
    media:
      `screen and (device-width: ${d.dw}px) and (device-height: ${d.dh}px) ` +
      `and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: ${f.orientation})`,
  })),
);
