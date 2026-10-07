// Authorization coverage inventory for every Route Handler under src/app/api.
// Used by `node scripts/route-inventory.mjs` (writes docs/authorization-matrix.md,
// `--check` fails when the committed file is stale) and by tests/unit/route-inventory.test.ts
// (fails when a route/method has no authentication guard and is not an explicitly
// justified public endpoint). The point: authorization coverage is ENFORCED by CI,
// not asserted once in a report.
import fs from "node:fs";
import path from "node:path";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const API_DIR = "src/app/api";

/** Endpoints that are deliberately reachable without a session, with the reason. Adding
 * an entry here is a security decision that shows up in review. */
export const PUBLIC_ROUTES = {
  "app-version GET": "Public, read-only release info for the Android updater (cached, no user data).",
  "auth/[...nextauth] GET": "Auth.js pass-through handler (its own CSRF/state checks).",
  "auth/[...nextauth] POST": "Auth.js pass-through handler (its own CSRF/state checks).",
  "auth/forgot-password POST": "Pre-login; rate limited per IP and email; answers identically for unknown emails.",
  "auth/login POST": "Pre-login; throttled per IP and account; no account enumeration.",
  "auth/logout POST": "Clears the caller's own cookie; no data.",
  "auth/operator-login POST": "Pre-login; throttled per IP and mobile.",
  "auth/operator-signup POST": "Pre-login join request; rate limited per IP/mobile/business code; needs admin approval.",
  "auth/register POST": "Creates a new tenant; rate limited per IP.",
  "auth/reset-password POST": "Pre-login; single-use hashed token; rate limited.",
  "health GET": "Liveness probe, no data, no database.",
  "health/ready GET": "Readiness probe, reports ok/failed only, no secrets.",
  "support/login POST": "Support console password gate; throttled; 404 when disabled.",
  "support/logout POST": "Revokes the presented support token (token bearer), idempotent.",
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name === "route.ts" ? [p] : [];
  });
}

/** Splits a route file into one source slice per exported HTTP method. */
function methodSlices(src) {
  const re = /export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
  const hits = [...src.matchAll(re)].map((m) => ({ method: m[1], index: m.index }));
  // Auth.js: `export const { GET, POST } = handlers;`
  for (const m of src.matchAll(/export\s+const\s*\{([^}]*)\}\s*=\s*handlers/g)) {
    for (const name of m[1].split(",").map((x) => x.trim())) {
      if (METHODS.includes(name)) hits.push({ method: name, index: m.index });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits.map((h, i) => ({ method: h.method, body: src.slice(h.index, hits[i + 1]?.index ?? src.length) }));
}

/** schemaName -> true when its definition mentions expectedVersion (optimistic concurrency). */
function versionedSchemas(root) {
  const dir = path.join(root, "src/lib/validation");
  const map = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const part of src.split(/^export const /m).slice(1)) {
      const name = part.match(/^(\w+)/)?.[1];
      if (name) map.set(name, /expectedVersion/.test(part));
    }
  }
  return map;
}

function classify(body) {
  if (/requireBusinessApi\(/.test(body)) return { principal: "business owner", tenant: "session.businessId" };
  if (/requireOperatorApi\(/.test(body)) return { principal: "operator", tenant: "session.businessId" };
  if (/requireSupportApi\(/.test(body)) return { principal: "support token", tenant: "businessCode (support only)" };
  return { principal: "NONE", tenant: "-" };
}

export function buildInventory(root = ".") {
  const files = walk(path.join(root, API_DIR)).sort();
  const versioned = versionedSchemas(root);
  const rows = [];
  for (const file of files) {
    const rel = path.relative(path.join(root, API_DIR), path.dirname(file)).replace(/\\/g, "/");
    const src = fs.readFileSync(file, "utf8");
    for (const { method, body } of methodSlices(src)) {
      const { principal, tenant } = classify(body);
      rows.push({
        route: rel,
        method,
        key: `${rel} ${method}`,
        principal,
        tenant,
        publicReason: PUBLIC_ROUTES[`${rel} ${method}`] ?? null,
        // Login routes throttle inside Auth.js's authorize() (signIn -> authenticateOwner/Operator).
        rateLimited: /enforceAuthLimits|enforceRateLimits|checkRateLimits|signIn\(|requestOperatorJoin/.test(body),
        idempotent: /runIdempotent\(/.test(body),
        versioned:
          /expectedVersion/.test(body) ||
          [...body.matchAll(/parseBody\(\s*req\s*,\s*(\w+)/g)].some((m) => versioned.get(m[1]) === true),
        paginated: /parsePagination\(/.test(body),
        wrapped: /withApi\(/.test(body),
        mutating: method !== "GET",
      });
    }
  }
  return rows;
}

/** Problems that must fail CI. */
export function findViolations(rows) {
  const problems = [];
  for (const r of rows) {
    if (r.principal === "NONE" && !r.publicReason) {
      problems.push(`${r.key}: no authentication guard (requireBusinessApi/requireOperatorApi/requireSupportApi) and not in PUBLIC_ROUTES`);
    }
    if (r.principal !== "NONE" && r.publicReason) {
      problems.push(`${r.key}: listed as public but it has a guard — remove it from PUBLIC_ROUTES`);
    }
  }
  const known = new Set(rows.map((r) => r.key));
  for (const key of Object.keys(PUBLIC_ROUTES)) {
    if (!known.has(key)) problems.push(`${key}: stale PUBLIC_ROUTES entry (route/method no longer exists)`);
  }
  return problems;
}

export function renderMarkdown(rows) {
  const yes = (b) => (b ? "yes" : "");
  const lines = [
    "# Authorization matrix (generated)",
    "",
    "Generated by `node scripts/route-inventory.mjs` from the Route Handlers in `src/app/api`.",
    "`npm test` fails if a route or method has no authentication guard and is not an explicitly",
    "justified public endpoint (see `PUBLIC_ROUTES` in `scripts/lib/route-inventory.mjs`), and CI",
    "fails if this file is stale. Do not edit by hand.",
    "",
    "* **Principal** — who may call it: business owner session, operator session, support token, or public.",
    "* **Tenant source** — where the business id comes from. Never the request body or query:",
    "  it is always taken from the verified session (support routes address a business by its code and are",
    "  gated by a support session).",
    "* **Throttled** — the handler itself applies a rate limit (other routes rely on session auth).",
    "* **Idempotent / Versioned / Paged** — `Idempotency-Key`, `expectedVersion`, cursor pagination supported.",
    "",
    "| Route | Method | Principal | Tenant source | Throttled | Idempotent | Versioned | Paged |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const principal = r.principal === "NONE" ? `public — ${r.publicReason}` : r.principal;
    lines.push(
      `| \`/api/${r.route}\` | ${r.method} | ${principal} | ${r.tenant} | ${yes(r.rateLimited)} | ${yes(r.idempotent)} | ${yes(r.versioned)} | ${yes(r.paginated)} |`,
    );
  }
  const total = rows.length;
  const pub = rows.filter((r) => r.principal === "NONE").length;
  lines.push("", `**${total}** route/method pairs: **${total - pub}** authenticated, **${pub}** public (each justified above).`, "");
  return lines.join("\n");
}
