import "dotenv/config";

/**
 * Tests that touch the database use DATABASE_URL — point TEST_DATABASE_URL at a
 * NON-production database and it is used instead. They only ever create
 * throwaway businesses (code prefix "TST") and delete them afterwards, but
 * never run them against production data.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.APP_URL ??= "https://app.example.test";
process.env.LOG_LEVEL ??= "error";
// Small pool per test process: files run sequentially, and concurrency tests only need a handful.
process.env.DB_POOL_MAX ??= "6";
