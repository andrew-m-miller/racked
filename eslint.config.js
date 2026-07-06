import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

// Flat-config ESLint (Phase 11). Scope is deliberately narrow: core
// correctness rules plus the react-hooks rules that catch stale-closure and
// dependency bugs — no style rules (formatting is by hand, matching the
// codebase). The edge functions are Deno TypeScript and are excluded; they're
// checked at deploy time instead.
export default [
  { ignores: ["dist/", "dev-dist/", "supabase/"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      // The classic hooks rules — the ones that catch stale-closure and
      // dependency bugs. The plugin's newer compiler-alignment rules
      // (purity, refs, set-state-in-effect) flag idioms this codebase uses
      // deliberately (event-driven Date.now() reads, the init-day effect);
      // adopt them only alongside the React Compiler itself.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Only the two react rules that make no-unused-vars JSX-aware; the
      // full react ruleset is noise for an inline-style codebase.
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
    },
  },
  {
    files: ["public/push-sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
];
