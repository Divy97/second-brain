import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import importX from "eslint-plugin-import-x"
import turboPlugin from "eslint-plugin-turbo"
import tseslint from "typescript-eslint"

/**
 * Shared ESLint configuration. Every rule is an error: lint is a gate, not a hint.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  importX.flatConfigs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    settings: {
      "import-x/internal-regex": "^(@workspace|@)/",
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      eqeqeq: ["error", "always"],
      "no-param-reassign": "error",
      "prefer-const": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid",
        },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        { selector: "variable", modifiers: ["destructured"], format: null },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        {
          selector: "parameter",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        { selector: "import", format: null },
        {
          selector: ["objectLiteralProperty", "typeProperty"],
          format: ["camelCase", "PascalCase", "snake_case", "UPPER_CASE"],
        },
        {
          selector: [
            "objectLiteralProperty",
            "typeProperty",
            "objectLiteralMethod",
          ],
          modifiers: ["requiresQuotes"],
          format: null,
        },
      ],
      "import-x/no-unresolved": "off",
      "import-x/named": "off",
      "import-x/no-duplicates": "error",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier
)
