import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      businessId: string;
      role: string;
      /** Session revocation counter (User/Operator.tokenVersion at sign-in). 0 for tokens issued before it existed. */
      tokenVersion: number;
      /** Present only for sessions opened by support impersonation. */
      supportSessionId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    businessId: string;
    role: string;
    tokenVersion: number;
    supportSessionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    businessId: string;
    role: string;
    /** Optional: tokens minted before revocation existed don't have it. */
    tokenVersion?: number;
    supportSessionId?: string;
  }
}
