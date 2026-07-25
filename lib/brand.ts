// The ONE allowed hardcoded brand-color literal in the codebase.
//
// Platform APIs that style browser/OS chrome — the PWA web manifest
// (`background_color` / `theme_color`) and the `<meta name="theme-color">`
// viewport — require a literal color string and cannot read CSS custom
// properties. So this single value is the boundary. Keep it in sync with
// `--primary` in app/globals.css. Everywhere else in the UI, reference design
// tokens (utilities or var(--token)) — never a raw color. See docs/DESIGN_SYSTEM.md.
//
// eslint-disable-next-line no-restricted-syntax -- platform APIs need a literal; see note above
export const BRAND_THEME_COLOR = "#047857";

// The page surface, light + dark — the SAME platform-boundary exception. These
// paint the PWA splash canvas (manifest `background_color`) and the generated
// iOS launch images, so they must match first paint or the splash→app hand-off
// jumps colour. Keep in sync with `--background` (light) and `:root.dark
// --background` in app/globals.css.
// eslint-disable-next-line no-restricted-syntax -- platform APIs need a literal; see note above
export const BRAND_SURFACE_COLOR = "#faf6ec"; // cream
// eslint-disable-next-line no-restricted-syntax -- platform APIs need a literal; see note above
export const BRAND_SURFACE_COLOR_DARK = "#1a140f"; // deep warm brown
