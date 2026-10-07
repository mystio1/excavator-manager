import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repository-side proof of the runtime/migration database split (docs/security.md section 15): the Prisma CLI may use
 * a privileged MIGRATE_DATABASE_URL, the running application must only ever use DATABASE_URL, so it can run as a
 * least-privilege role. Whether Render is configured that way is UNVERIFIED (see `npm run check:db-role`).
 */
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "generated" ? [] : walk(p)) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

describe("runtime vs migration database credential", () => {
  it("no application code reads MIGRATE_DATABASE_URL", () => {
    const offenders = walk("src").filter((f) => fs.readFileSync(f, "utf8").includes("MIGRATE_DATABASE_URL"));
    expect(offenders).toEqual([]);
  });

  it("the Prisma CLI prefers MIGRATE_DATABASE_URL and falls back to DATABASE_URL", () => {
    const config = fs.readFileSync("prisma.config.ts", "utf8");
    expect(config).toMatch(/MIGRATE_DATABASE_URL"\]\s*\|\|\s*process\.env\["DATABASE_URL"\]/);
  });

  it("the application's client is built from DATABASE_URL only", () => {
    const db = fs.readFileSync("src/lib/db.ts", "utf8");
    expect(db).toContain("process.env.DATABASE_URL");
  });

  it("the migration scripts blank MIGRATE_DATABASE_URL so a developer's shell cannot redirect a scenario run", () => {
    for (const f of ["scripts/test-migrations.mjs", "scripts/restore-drill.mjs"]) {
      expect(fs.readFileSync(f, "utf8")).toMatch(/MIGRATE_DATABASE_URL:\s*""/);
    }
  });
});
