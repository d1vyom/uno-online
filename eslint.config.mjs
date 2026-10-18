import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
export default tseslint.config(
  { ignores: [".next/**", ".next-e2e/**", "frontend/**", "backend/**", ".superpowers/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.{ts,tsx}"], plugins: { "react-hooks": hooks }, rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
  } },
);
