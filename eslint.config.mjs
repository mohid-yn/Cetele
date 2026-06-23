import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Disable ESLint rules that conflict with Prettier — Prettier owns formatting.
  prettier,

  // Modularity guard: all UI must reference design tokens (app/globals.css),
  // never hardcoded colors. Use token-backed utilities (bg-primary, text-foreground)
  // or var(--token); raw hex / rgb() / hsl() in components is an error.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "Hardcoded hex color. Reference a design token instead: a utility (bg-primary, text-foreground…) or var(--token). See docs/DESIGN_SYSTEM.md.",
        },
        {
          selector: "Literal[value=/(rgb|rgba|hsl|hsla)\\(/i]",
          message:
            "Hardcoded color function. Reference a design token instead (utility or var(--token)). See docs/DESIGN_SYSTEM.md.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            "Hardcoded hex color in template literal. Reference a design token instead. See docs/DESIGN_SYSTEM.md.",
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
