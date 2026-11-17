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
  // ADR-001: o domínio não importa nada de fora dele (aplicação, adapters, apresentação, SDKs).
  {
    files: ["apps/api/src/dominio/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/aplicacao/**", "**/adapters/**", "**/apresentacao/**"],
              message: "O domínio não pode depender de camadas externas (ADR-001).",
            },
            {
              group: ["@aws-sdk/*", "fastify", "zod"],
              message: "O domínio não conhece infraestrutura nem bibliotecas de borda (ADR-001).",
            },
          ],
        },
      ],
    },
  },
);
