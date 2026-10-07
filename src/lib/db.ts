import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
// Side-effect import: installs the Decimal -> number JSON serializer before any query runs.
import "@/lib/money";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Connection pool sizing.
 *
 * Supabase's Session Pooler on this project hard-caps concurrent connections at
 * 15 (connection #16 is rejected with EMAXCONNSESSION), and `prisma migrate
 * deploy` / a second instance during a rolling deploy each need connections of
 * their own. The pool is therefore explicit and bounded: DB_POOL_MAX (default
 * 10, hard-clamped to 12) leaves >=3 connections of headroom. Interactive
 * transactions (idempotent creates, payments) each hold ONE connection for
 * their duration, so keep them short. Do not raise this without first
 * confirming the pooler's actual pool_size for the active plan.
 */
function poolMax(): number {
  const configured = Number(process.env.DB_POOL_MAX ?? "10");
  if (!Number.isInteger(configured) || configured < 1) return 10;
  return Math.min(configured, 12);
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: poolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
