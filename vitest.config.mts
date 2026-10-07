import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Jalon 0 : aucun test encore ; les premiers arrivent avec lib/dungeon au WE 1.
    passWithNoTests: true,
  },
});
