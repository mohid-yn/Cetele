"use client";

/**
 * Theme system (UI_PRACTICES §2): system default + persisted manual override.
 * Resolves "system" to an explicit `.dark` class on <html> so the toggle always
 * wins over the OS. Pair with the no-flash script in the root layout, which sets
 * the class before paint; this provider keeps it in sync after hydration.
 */

import * as React from "react";

export type Theme = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "cetele-theme";

interface ThemeContextValue {
  theme: Theme;
  /** The actually-applied theme once "system" is resolved. */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(theme: Theme): "light" | "dark" {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  // Sync state from storage on mount (the class is already set by the no-flash
  // script, so there is no visual change here — just state catch-up).
  React.useEffect(() => {
    const stored =
      (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "system";
    // Mount-time catch-up from storage; the class is already correct (no-flash
    // script), so this only syncs React state — not a render-sync loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    setThemeState(stored);
    setResolved(applyTheme(stored));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // When following the system, react to OS theme changes live.
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_STORAGE_KEY, t);
    setResolved(applyTheme(t));
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme],
  );

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
 * `.dark` class from storage/OS, preventing a light-mode flash (FOUC).
 */
export const THEME_NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
