import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/services/auth";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const parsed = forgotPasswordSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email" }, { status: 400 });
  }

  try {
    // The reset link always points at whichever host the request actually
    // came in on, same as the original Server Action's approach — works
    // for a browser hitting this directly, and also correct for the
    // Android app's cross-origin call, since the email link needs to open
    // in a real browser either way, not inside the app's own WebView.
    // x-forwarded-proto, not req.url's own protocol — Render terminates
    // TLS and proxies internally over plain HTTP, so req.url would read
    // "http:" even for a real https:// request without it.
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const origin = `${proto}://${host}`;
    await requestPasswordReset(parsed.data.email, origin);
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }

  return NextResponse.json({ submitted: true });
}
