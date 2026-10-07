/**
 * Import this FIRST in every DB-backed bills test file (before anything that
 * pulls in "@/lib/db").
 *
 * The shared Postgres session pooler only allows 15 connections in total and
 * other suites run side by side, so this suite keeps its own Prisma pool small.
 * Interactive transactions hold one connection each; the concurrency tests
 * below (5 parallel payments, duplicate requests) simply queue for a free one.
 */
process.env.DB_POOL_MAX = "3";

export {};
