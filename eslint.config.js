import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Core isolation: src/core/ is pure logic and must never touch the browser.
    // It may only import from within src/core/ (relative paths).
    files: ["src/core/**/*.ts"],
    languageOptions: {
      globals: {},
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/render/**", "**/input/**", "**/ui/**", "**/main"],
              message: "src/core/ must not import from outside src/core/.",
            },
            {
              // Anything that does not start with "." is a bare package or absolute specifier.
              regex: "^[^.]",
              message:
                "src/core/ must not import packages; only relative imports within src/core/ are allowed.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "No browser globals in src/core/." },
        { name: "document", message: "No browser globals in src/core/." },
        { name: "navigator", message: "No browser globals in src/core/." },
        { name: "localStorage", message: "No browser globals in src/core/." },
        { name: "requestAnimationFrame", message: "No browser globals in src/core/." },
        { name: "performance", message: "No browser globals in src/core/." },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the seeded RNG in src/core/rng.ts instead of Math.random().",
        },
      ],
    },
  },
  {
    // Math.random() is forbidden everywhere, not just in core.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the seeded RNG in src/core/rng.ts instead of Math.random().",
        },
      ],
    },
  },
  {
    files: ["*.config.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // The ESLint config itself is plain JavaScript outside the TypeScript project.
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
