import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 無料診断の切り出し（scripts/extract-free.mjs）。テンプレートと出力はこのアプリの一部ではない
    "scripts/extract-free/overrides/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
