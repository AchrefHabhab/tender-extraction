import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".cache/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,
  {
    rules: {
      semi: ["error", "always"],
      "prefer-arrow-callback": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
