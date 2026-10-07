import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// Plain ESM helper shared with scripts/route-inventory.mjs.
import { buildInventory, findViolations, PUBLIC_ROUTES } from "../../scripts/lib/route-inventory.mjs";

type Row = { key: string; principal: string; method: string; route: string; mutating: boolean; wrapped: boolean };
const rows = buildInventory(".") as Row[];

/** Authorization coverage is enforced here: a new route/method with no authentication
 * guard fails CI unless it is added to PUBLIC_ROUTES with a written reason. */
describe("API authorization coverage", () => {
  it("every route/method is authenticated or explicitly justified public", () => {
    expect(findViolations(rows)).toEqual([]);
  });

  it("finds the whole API surface (guards against the scanner silently missing routes)", () => {
    const files = [] as string[];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === "route.ts") files.push(p);
      }
    };
    walk("src/app/api");
    const routesWithRows = new Set(rows.map((r) => r.route));
    expect(routesWithRows.size).toBe(files.length);
    expect(rows.length).toBeGreaterThan(90);
  });

  it("every mutating handler is wrapped in withApi (request id, error contract) except the documented exceptions", () => {
    const unwrapped = rows.filter((r) => r.mutating && !r.wrapped).map((r) => r.key);
    // Auth.js's own pass-through handler is the only mutating exception.
    expect(unwrapped).toEqual(["auth/[...nextauth] POST"]);
  });

  it("public routes are all pre-authentication, health or release-info endpoints", () => {
    const publicKeys = Object.keys(PUBLIC_ROUTES);
    for (const key of publicKeys) {
      expect(key).toMatch(/^(app-version|auth\/|health|support\/(login|logout))/);
    }
  });
});

describe("tenant context never comes from the client", () => {
  const read = (f: string) => fs.readFileSync(f, "utf8");
  const listTs = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? listTs(p) : p.endsWith(".ts") ? [p] : [];
    });

  it("no request-body schema accepts a businessId", () => {
    const offenders = listTs("src/lib/validation").filter((f) => /\bbusinessId\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no non-support request schema can carry a server-owned or security-sensitive field", () => {
    // Field-level authorization: these are derived or set by the server only. The support schemas legitimately
    // carry frozen/maxOperators/maxBillsPerDay (that is what support does); nothing else may. See
    // tests/security/mass-assignment.test.ts for the behavioural proof on the real routes.
    const SERVER_OWNED = ["tokenVersion", "passwordHash", "pinHash", "paidAmount", "totalAmount", "isArchived", "frozen", "maxOperators", "maxBillsPerDay", "role", "createdAt", "updatedAt"];
    const offenders: string[] = [];
    for (const f of listTs("src/lib/validation").filter((x) => !/support\.ts$/.test(x))) {
      for (const field of SERVER_OWNED) {
        if (new RegExp(String.raw`\b${field}\b`).test(read(f))) offenders.push(`${f}: ${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no route handler reads businessId from the body or the query string", () => {
    const offenders = listTs("src/app/api").filter((f) =>
      /searchParams\.get\(["']businessId["']\)|body\.businessId|input\.businessId|\.businessId\s*\)\s*;?\s*\/\/\s*client/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });

  it("every business-scoped route takes the tenant from the verified session", () => {
    const business = rows.filter((r) => r.principal === "business owner" || r.principal === "operator");
    expect(business.length).toBeGreaterThan(80);
  });
});
