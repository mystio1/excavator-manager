import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createSupportToken } from "@/lib/supportTokens";
import { clientIp, rateLimited } from "@/lib/rateLimit";

// Not reachable from anywhere in the normal owner/operator-facing UI —
// only by navigating straight to /support. A single shared password
// (SUPPORT_ACCESS_PASSWORD, unset by default — see below) grants a
// short-lived token that can list every business on the platform and open
// any of them as their admin, for remote troubleshooting.
export async function POST(req: Request) {
  const supportPassword = process.env.SUPPORT_ACCESS_PASSWORD;
  // Disabled entirely (404s) unless deliberately configured — never ships
  // active with no password set.
  if (!supportPassword) return new Response("Not found", { status: 404 });

  // This one password unlocks every business on the platform if
  // brute-forced, so it gets rate-limiting the rest of the app doesn't have.
  if (rateLimited(`support-login:${clientIp(req)}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  // Constant-time compare so response timing can't leak how many
  // characters matched.
  const provided = Buffer.from(password.padEnd(supportPassword.length, "\0"));
  const expected = Buffer.from(supportPassword.padEnd(password.length, "\0"));
  const matches = password.length === supportPassword.length && crypto.timingSafeEqual(provided, expected);
  if (!matches) return NextResponse.json({ error: "Incorrect password" }, { status: 401 });

  if (!process.env.AUTH_SECRET) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  return NextResponse.json({ token: createSupportToken(process.env.AUTH_SECRET) });
}
