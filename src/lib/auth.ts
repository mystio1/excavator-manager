import NextAuth, { CredentialsSignin } from "next-auth";
import { authSecrets } from "@/lib/auth-secrets";
import Credentials from "next-auth/providers/credentials";
import {
  authenticateOperator,
  authenticateOwner,
  authenticateSupportImpersonation,
  type SessionUser,
  type SignInResult,
} from "@/lib/services/auth";

/**
 * A sign-in that is refused for a reason the route must tell apart from "wrong
 * credentials": throttled, or a (verified) owner of a frozen business. The
 * `code` travels with the AuthError that signIn() throws (see
 * signin-response.ts for the routes' side of this). Everything else — unknown
 * account, wrong password — is a plain `null` from authorize(), i.e. the
 * generic CredentialsSignin, so nothing hints at which of the two it was.
 *
 * NOTE: `code` ends up in a URL on the catch-all handler's redirect, so it must
 * never hint at anything sensitive; "rate_limited" and "account_frozen" don't.
 */
class SignInRefused extends CredentialsSignin {
  retryAfterSec?: number;

  constructor(code: "rate_limited" | "account_frozen", retryAfterSec?: number) {
    super();
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

function unwrap(result: SignInResult): SessionUser | null {
  if (result.ok) return result.user;
  if (result.reason === "rate_limited") throw new SignInRefused("rate_limited", result.retryAfterSec);
  if (result.reason === "account_frozen") throw new SignInRefused("account_frozen");
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Render (and most PaaS hosts) terminate TLS and proxy requests, so the
  // Host header Auth.js sees doesn't match a hardcoded expectation by
  // default — it rejects everything as an UntrustedHost unless told to
  // trust the platform's proxy headers.
  trustHost: true,
  // A single string normally; [current, previous] during a rolling AUTH_SECRET rotation (src/lib/auth-secrets.ts).
  secret: authSecrets(),
  // Stateless JWT cookie, valid for at most 30 days (Auth.js's default, now explicit).
  // It is NOT the only gate: every request re-checks the account in the database
  // (src/lib/session.ts), so a password change, "sign out everywhere", a disabled
  // operator login or a frozen/deleted account takes effect at once, not at expiry.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  // The Android app's bundled static build runs from a different origin
  // (capacitor://localhost) than the API (the Render domain) — a normal
  // "lax" session cookie is never sent on those cross-origin fetch() calls.
  // "none" makes it a cross-site cookie, which browsers require Secure for
  // (a SameSite=None cookie without Secure is dropped entirely) — only
  // applied in production (HTTPS); local dev over plain http://localhost
  // can't satisfy Secure at all, and doesn't need cross-origin cookies since
  // nothing there talks to the app from a different origin.
  cookies:
    process.env.NODE_ENV === "production"
      ? {
          sessionToken: {
            options: {
              sameSite: "none",
              secure: true,
            },
          },
        }
      : undefined,
  providers: [
    // The credential checks (throttling, timing-safe unknown-user handling,
    // the frozen check) live in services/auth.ts so they apply to EVERY way of
    // reaching a provider — the login routes and the catch-all
    // /api/auth/callback/* handler alike — and can be tested without NextAuth.
    Credentials({
      id: "credentials",
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const identifier = credentials?.identifier;
        const password = credentials?.password;
        if (typeof identifier !== "string" || typeof password !== "string") {
          return null;
        }
        return unwrap(await authenticateOwner(identifier, password, request));
      },
    }),
    // Operator self-login: mobile + PIN, checked against the Operator table
    // (not User) — a wholly separate principal from the owner login above.
    Credentials({
      id: "operator",
      credentials: {
        mobile: { label: "Mobile", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, request) {
        const mobile = credentials?.mobile;
        const pin = credentials?.pin;
        if (typeof mobile !== "string" || typeof pin !== "string") {
          return null;
        }
        return unwrap(await authenticateOperator(mobile, pin, request));
      },
    }),
    // Support-console impersonation (see src/app/api/support/impersonate)
    // — never reachable with just a userId; the caller must also present a
    // live support session token, verified against the database (revoked or
    // expired sessions fail) here, not just by the route calling this, so this
    // provider is safe even if invoked some other way. Signs the target owner
    // straight in as a real session, same shape as the "credentials" provider
    // above, and audits it in the target business.
    Credentials({
      id: "support-impersonate",
      credentials: {
        userId: { label: "User ID", type: "text" },
        supportToken: { label: "Support Token", type: "text" },
        reason: { label: "Reason", type: "text" },
      },
      async authorize(credentials) {
        const userId = credentials?.userId;
        const supportToken = credentials?.supportToken;
        if (typeof userId !== "string" || typeof supportToken !== "string") return null;
        const reason = typeof credentials?.reason === "string" ? credentials.reason : undefined;
        return authenticateSupportImpersonation(userId, supportToken, reason);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.businessId = user.businessId;
        token.role = user.role;
        // The revocation counter this session was issued under; session.ts
        // compares it with the database on every use.
        token.tokenVersion = user.tokenVersion;
        token.supportSessionId = user.supportSessionId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.businessId = token.businessId as string;
      session.user.role = token.role as string;
      // Tokens minted before revocation existed carry no version: 0 matches a
      // never-revoked account (see getValidBusinessSession). (JWT is an open
      // Record<string, unknown> here, so the claims are narrowed by hand.)
      session.user.tokenVersion = typeof token.tokenVersion === "number" ? token.tokenVersion : 0;
      session.user.supportSessionId = typeof token.supportSessionId === "string" ? token.supportSessionId : undefined;
      return session;
    },
  },
});
