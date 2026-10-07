#!/usr/bin/env node
/**
 * Runtime check of the security/caching response headers on a RUNNING server.
 *
 *   node scripts/check-headers.mjs http://localhost:3000       # local `next start` (CI does this)
 *   node scripts/check-headers.mjs https://your-app.example    # the live site, after a deploy
 *
 * tests/unit/health-and-headers.test.ts asserts what next.config.ts is CONFIGURED to send; this asserts
 * what a real server (and, against the live URL, Render's edge) actually SENDS. Production-only headers
 * (HSTS, CSP) are only present when the server runs with NODE_ENV=production (`next start` does).
 * Exit code 1 if any check fails. Read-only: it issues GET requests to public endpoints only.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function get(path) {
  const res = await fetch(base + path, { redirect: "manual", headers: { "user-agent": "check-headers" } });
  await res.arrayBuffer().catch(() => undefined);
  return res;
}

// --- a normal page ---------------------------------------------------------
const page = await get("/login");
const h = (res, name) => res.headers.get(name) ?? "";
check("GET /login answers 200", page.status === 200, `status ${page.status}`);

const hsts = h(page, "strict-transport-security");
check("HSTS with max-age >= 1 year", Number(/max-age=(\d+)/.exec(hsts)?.[1]) >= 31_536_000, hsts || "missing");

const csp = h(page, "content-security-policy");
for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'"]) {
  check(`CSP contains ${directive}`, csp.includes(directive));
}
check("CSP has no unsafe-eval", csp !== "" && !csp.includes("unsafe-eval"));

check("X-Frame-Options DENY", h(page, "x-frame-options").toUpperCase() === "DENY", h(page, "x-frame-options") || "missing");
check("X-Content-Type-Options nosniff", h(page, "x-content-type-options").toLowerCase() === "nosniff");
check("Referrer-Policy strict-origin-when-cross-origin", h(page, "referrer-policy") === "strict-origin-when-cross-origin", h(page, "referrer-policy") || "missing");
check("Cross-Origin-Opener-Policy same-origin", h(page, "cross-origin-opener-policy") === "same-origin");
check("Permissions-Policy disables camera", h(page, "permissions-policy").includes("camera=()"));
check("no X-Powered-By header leaks the framework", h(page, "x-powered-by") === "", h(page, "x-powered-by"));

// --- API responses ---------------------------------------------------------
for (const path of ["/api/health", "/api/dashboard"]) {
  const res = await get(path);
  const cc = h(res, "cache-control");
  check(`GET ${path} is not cacheable by a shared cache`, /no-store/.test(cc) && /private/.test(cc), `status ${res.status}, cache-control: ${cc || "missing"}`);
  check(`GET ${path} carries a request id`, h(res, "x-request-id").length > 0);
}
const unauth = await get("/api/dashboard");
check("an API call without a session is 401 (never data)", unauth.status === 401, `status ${unauth.status}`);

console.log(`\n${failures === 0 ? "all header checks passed" : failures + " header check(s) FAILED"} for ${base}`);
process.exit(failures === 0 ? 0 : 1);
