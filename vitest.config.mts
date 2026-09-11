import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests live in tests/unit and import project code through the same
// "@/..." alias the app uses. End-to-end tests (tests/e2e) belong to
// Playwright and are excluded here.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
