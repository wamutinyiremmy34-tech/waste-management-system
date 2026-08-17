import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Jest/test config files run under CommonJS/Node directly (not through the
  // Next.js bundler), so they legitimately need require() — same reasoning
  // as next.config.js itself, which Next.js's own default ignores already
  // exempt from this rule.
  {
    files: ["jest.config.js", "jest.setup.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
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
