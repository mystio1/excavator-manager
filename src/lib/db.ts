import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Dashboard-style pages fire 10-15 queries in a single Promise.all —
    // the pg default pool (max: 10) makes some of them queue for a free
    // connection instead of running concurrently, which measurably slows
    // down exactly the kind of parallel batch this app relies on. Benchmarked
    // directly against the production Supabase pooler: raising this from the
    // default cut a 15-query parallel batch from ~113ms to ~71ms.
    max: 20,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
