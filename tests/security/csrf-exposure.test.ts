import "../bills/pool";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { proxy } from "@/proxy";
import { POST as createCustomerPOST } from "@/app/api/customers/route";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { actAs } from "../bills/session-mock";

vi.mock("@/lib/session", () => import("../bills/session-mock"));

/**
 * Evidence for the CSRF finding that needs no browser and does not switch anything off.
 *
 * The production session cookie is SameSite=None, so a browser attaches it to a request a hostile
 * page starts. Two facts make that dangerous, and one control stops it:
 *
 *   1. EXPOSURE (statically provable): a mutating route handler, called on its own, accepts a
 *      cross-site `text/plain` form post carrying the victim's session cookie. Nothing in the handler
 *      looks at Origin or Content-Type. This test calls the real handler and shows the write happens.
 *   2. CONTROL: the same request, sent through the edge proxy (src/proxy.ts) first, is refused with
 *      403 CSRF_VALIDATION_FAILED and the handler never runs, so nothing is written.
 *
 * Together they show that the proxy check is what protects the API — removing it would reopen (1).
 */

let t: TestTenant;
const FORGED_BODY = JSON.stringify({ name: "Forged by evil.example", mobile: "9876500000" });

beforeAll(async () => {
  t = await createTenant("csrf-exposure");
  actAs(t);
});
afterAll(async () => {
  actAs(null);
  await cleanupTenant(t.businessId);
  await db.$disconnect();
});

const forged = () =>
  new NextRequest("https://app.example.test/api/customers", {
    method: "POST",
    headers: {
      // What a browser sends for <form method=POST enctype="text/plain" action=https://app.example.test/api/customers>
      // submitted from a hostile page: its own Origin, a "simple" content type, and the victim's cookie.
      origin: "https://evil.example",
      "content-type": "text/plain",
      "sec-fetch-site": "cross-site",
      cookie: "__Secure-authjs.session-token=victim-session",
    },
    body: FORGED_BODY,
  });

/** Runs a request the way production does: the proxy first; the route only if the proxy lets it through. */
async function viaEdge(request: NextRequest, handler: (r: Request, c: undefined) => Promise<Response>) {
  const edge = await proxy(request);
  const passedThrough = edge.headers.get("x-middleware-next") === "1";
  return passedThrough ? handler(request, undefined) : edge;
}

const countForged = () => db.customer.count({ where: { businessId: t.businessId, name: "Forged by evil.example" } });

describe("CSRF: exposure and control", () => {
  it("EXPOSURE: the handler on its own accepts the cross-site text/plain post and writes a row", async () => {
    const res = await createCustomerPOST(forged(), undefined);
    expect(res.status).toBe(200);
    expect(await countForged()).toBe(1); // the forged write happened — only the proxy gate prevents this in production
    await db.customer.deleteMany({ where: { businessId: t.businessId, name: "Forged by evil.example" } });
  });

  it("CONTROL: the identical request through the edge proxy is refused with 403 and nothing is written", async () => {
    const res = await viaEdge(forged(), createCustomerPOST);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "CSRF_VALIDATION_FAILED", type: "urn:excavator:problem:csrf-validation-failed" });
    expect(await countForged()).toBe(0);
  });

  it("CONTROL: a cookie-bearing post with no Origin and a cross-site Sec-Fetch-Site is refused too", async () => {
    const request = new NextRequest("https://app.example.test/api/customers", {
      method: "POST",
      headers: { "content-type": "text/plain", "sec-fetch-site": "cross-site", cookie: "__Secure-authjs.session-token=victim-session" },
      body: FORGED_BODY,
    });
    const res = await viaEdge(request, createCustomerPOST);
    expect(res.status).toBe(403);
    expect(await countForged()).toBe(0);
  });

  it("the app's own origin still works end to end through the proxy (the control is not over-blocking)", async () => {
    const request = new NextRequest("https://app.example.test/api/customers", {
      method: "POST",
      headers: { origin: "https://app.example.test", "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ name: "Legit Customer", mobile: "9876500001" }),
    });
    const res = await viaEdge(request, createCustomerPOST);
    expect(res.status).toBe(200);
    expect(await db.customer.count({ where: { businessId: t.businessId, name: "Legit Customer" } })).toBe(1);
  });

  it("the Android app's origin (https://localhost) is allowed through the proxy", async () => {
    const request = new NextRequest("https://app.example.test/api/customers", {
      method: "POST",
      headers: { origin: "https://localhost", "content-type": "application/json", cookie: "__Secure-authjs.session-token=app-session" },
      body: JSON.stringify({ name: "Android Customer", mobile: "9876500002" }),
    });
    const res = await viaEdge(request, createCustomerPOST);
    expect(res.status).toBe(200);
  });
});
