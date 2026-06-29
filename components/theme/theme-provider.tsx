"use client";

/**
 * Theme system (UI_PRACTICES §2): persisted manual light/dark choice.
 * Applies an explicit `.dark` class on <html>. Pair with the no-flash script in
 * the root layout, which sets the class before paint; this provider keeps it in
 * sync after hydration. Light-first (D20/D25): the default is light.
 */

import * as React from "react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "cetele-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/** Read a sanitized theme from storage; anything but "dark" (incl. the legacy
 * "system" value or an empty store) falls back to the light-first default. */
function storedTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");

  // Sync state from storage on mount (the class is already set by the no-flash
  // script, so there is no visual change here — just state catch-up).
  React.useEffect(() => {
    const stored = storedTheme();
    // Mount-time catch-up from storage; the class is already correct (no-flash
    // script), so this only syncs React state — not a render-sync loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    setThemeState(stored);
    applyTheme(stored);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_STORAGE_KEY, t);
    applyTheme(t);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/**
 * Inline script string for the root layout — runs before paint to set the
 * `.dark` class from storage, preventing a wrong-theme flash (FOUC). Only an
 * explicit "dark" enables dark; everything else (incl. legacy "system") = light.
 */
export const THEME_NO_FLASH_SCRIPT = `(function(){try{document.documentElement.classList.toggle('dark',localStorage.getItem('${THEME_STORAGE_KEY}')==='dark');}catch(e){}})();`;
