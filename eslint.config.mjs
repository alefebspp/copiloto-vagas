import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/*.config.ts", "eslint.config.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // ADR-001: the domain imports nothing from outside it (application, adapters, presentation, SDKs).
  {
    files: ["apps/api/src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/application/**", "**/adapters/**", "**/presentation/**"],
              message: "The domain cannot depend on outer layers (ADR-001).",
            },
            {
              group: ["@aws-sdk/*", "fastify", "zod"],
              message: "The domain knows nothing about infrastructure or edge libraries (ADR-001).",
            },
          ],
        },
      ],
    },
  },
);
