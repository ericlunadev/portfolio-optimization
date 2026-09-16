import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // Points DATABASE_URL at a per-worker throwaway file and applies the
    // committed migrations to it, before the test file — and therefore
    // `db/index.ts`'s module-scope client — is imported. See src/test/setup.ts.
    setupFiles: ["./src/test/setup.ts"],
  },
});
