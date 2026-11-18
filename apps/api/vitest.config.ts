import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The entry points only wire adapters to ports; they are exercised by running them.
      exclude: ["src/**/*.test.ts", "src/entry/**"],
    },
  },
});
