import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "next-env.d.ts",
    ".agents/**",
    ".codex/**",
  ]),
  // Client-side storage and browser preference hydration intentionally set state in effects.
  { rules: { "react-hooks/set-state-in-effect": "off" } },
]);
