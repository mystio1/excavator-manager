import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "@/lib/rateLimit";

const req = (headers: Record<string, string>) => new Request("https://x.test/api/auth/login", { method: "POST", headers });

const original = process.env.TRUSTED_PROXY_HOPS;
afterEach(() => {
  if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = original;
});

describe("clientIp", () => {
  it("ignores spoofed left-most X-Forwarded-For entries (default: 1 trusted hop)", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    // The client sent "6.6.6.6"; our proxy appended the address it actually saw.
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("rotating the spoofed prefix never changes the resulting IP (cannot dodge a per-IP limit)", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(clientIp(req({ "x-forwarded-for": `10.0.0.${i}, 198.51.100.7` })));
    expect([...seen]).toEqual(["198.51.100.7"]);
  });

  it("honours TRUSTED_PROXY_HOPS (counts entries from the right)", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    // client, then two proxies: the client address is the 2nd from the right.
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.1.1.1" }))).toBe("203.0.113.9");

    process.env.TRUSTED_PROXY_HOPS = "3";
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.1.1.1" }))).toBe("6.6.6.6");
  });

  it("uses the left-most entry when there are fewer entries than hops", () => {
    process.env.TRUSTED_PROXY_HOPS = "3";
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("returns 'unknown' with no header, with 0 trusted hops, and never trusts other headers", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(clientIp(req({}))).toBe("unknown");
    expect(clientIp(req({ "x-real-ip": "6.6.6.6", "true-client-ip": "7.7.7.7" }))).toBe("unknown");

    process.env.TRUSTED_PROXY_HOPS = "0";
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("unknown");
  });

  it("falls back to 1 hop for an invalid TRUSTED_PROXY_HOPS value", () => {
    process.env.TRUSTED_PROXY_HOPS = "banana";
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });
});
