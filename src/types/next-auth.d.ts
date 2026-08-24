import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      businessId: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    businessId: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    businessId: string;
    role: string;
  }
}
