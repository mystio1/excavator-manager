import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // DB-backed tests create their own throwaway tenants (unique business
    // codes) and clean them up, but the Supabase session pooler is capped at 15
    // connections and every test file opens its own Prisma pool, so files run
    // one at a time (the whole suite takes ~3.5 minutes). In CI (a local
    // Postgres service) this is simply the safe, deterministic default.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
