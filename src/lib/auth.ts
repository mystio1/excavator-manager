import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifySupportToken } from "@/lib/supportTokens";
import { findUserByIdentifier } from "@/lib/services/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Render (and most PaaS hosts) terminate TLS and proxy requests, so the
  // Host header Auth.js sees doesn't match a hardcoded expectation by
  // default — it rejects everything as an UntrustedHost unless told to
  // trust the platform's proxy headers.
  trustHost: true,
  session: { strategy: "jwt" },
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
    Credentials({
      id: "credentials",
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier;
        const password = credentials?.password;
        if (typeof identifier !== "string" || typeof password !== "string") {
          return null;
        }

        // Same input box accepts either — "@" is enough to tell them apart,
        // no email address can appear as a phone number and vice versa.
        const user = await findUserByIdentifier(identifier);
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          businessId: user.businessId,
          role: user.role,
        };
      },
    }),
    // Operator self-login: mobile + PIN, checked against the Operator table
    // (not User) — a wholly separate principal from the owner login above.
    // A mobile number isn't guaranteed unique across businesses, so every
    // canLogin operator sharing it is tried until one PIN matches.
    Credentials({
      id: "operator",
      credentials: {
        mobile: { label: "Mobile", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        const mobile = credentials?.mobile;
        const pin = credentials?.pin;
        if (typeof mobile !== "string" || typeof pin !== "string") {
          return null;
        }

        const candidates = await db.operator.findMany({
          where: { mobile: mobile.trim(), canLogin: true, isArchived: false },
        });

        for (const operator of candidates) {
          if (!operator.pinHash) continue;
          const valid = await verifyPassword(pin, operator.pinHash);
          if (valid) {
            return {
              id: operator.id,
              name: operator.name,
              businessId: operator.businessId,
              role: "OPERATOR",
            };
          }
        }

        return null;
      },
    }),
    // Support-console impersonation (see src/app/api/support/impersonate)
    // — never reachable with just a userId; the caller must also present a
    // valid, unexpired support token (checked here too, not just by the
    // route calling this, so this provider is safe even if invoked some
    // other way). Signs the target owner straight in as a real session,
    // same shape as the "credentials" provider above.
    Credentials({
      id: "support-impersonate",
      credentials: {
        userId: { label: "User ID", type: "text" },
        supportToken: { label: "Support Token", type: "text" },
      },
      async authorize(credentials) {
        const userId = credentials?.userId;
        const supportToken = credentials?.supportToken;
        if (typeof userId !== "string" || typeof supportToken !== "string") return null;
        if (!process.env.AUTH_SECRET || !verifySupportToken(supportToken, process.env.AUTH_SECRET)) return null;

        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          businessId: user.businessId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.businessId = user.businessId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.businessId = token.businessId as string;
      session.user.role = token.role as string;
      return session;
    },
  },
});
