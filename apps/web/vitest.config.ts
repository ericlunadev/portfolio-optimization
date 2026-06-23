import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // The current suite covers pure helpers, so `node` is sufficient and avoids
    // pulling in jsdom. Switch to "jsdom" here (and add jsdom to devDependencies)
    // when component tests are added.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
