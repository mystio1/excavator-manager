import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Supabase's Session Pooler on this project hard-caps concurrent
    // connections at 15 (confirmed directly: connection #16 is rejected
    // with EMAXCONNSESSION) — max must stay safely under that regardless of
    // how much parallel query throughput would otherwise help. 10 matches
    // pg's own default and leaves real headroom; do not raise this without
    // first confirming the pooler's actual pool_size for whatever plan is
    // active at the time.
    max: 10,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
