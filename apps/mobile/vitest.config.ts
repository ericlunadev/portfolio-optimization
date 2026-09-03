import { defineConfig } from "vitest/config";

/**
 * Unit tests for the app's plain TypeScript logic (`src/lib`). React Native
 * components are not rendered here — that needs a native runtime — so the
 * include list is deliberately narrow.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.{test,spec}.ts"],
  },
});
