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
export const BRAND_THEME_COLOR = "#1d3a5f";
