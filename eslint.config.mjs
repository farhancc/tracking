import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const DB_RULE_MESSAGE =
  "Database access goes through withUser() from '@/db/client' in server modules only (docs/05 §3, rule 4).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Only lib/auth may use the fyos_auth connection; UI code may not touch the database at all.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/db/auth-client", message: "Only src/lib/auth may use the auth database role." },
            { name: "pg", message: DB_RULE_MESSAGE },
          ],
          patterns: [{ group: ["@/db/client", "@/db/drizzle"], message: DB_RULE_MESSAGE }],
        },
      ],
    },
  },
  {
    // Server-side modules that are allowed to open transactions.
    files: ["src/db/**", "src/lib/api/**", "src/features/*/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/db/auth-client", message: "Only src/lib/auth may use the auth database role." }] },
      ],
    },
  },
  {
    files: ["src/lib/auth/**"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
