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
  ]),
  {
    rules: {
      // La carga inicial de datos en useEffect es intencional (fetch + setState
      // tras await). La regla estricta de React 19 no distingue esta asincronía.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
