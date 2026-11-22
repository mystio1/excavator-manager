import { z } from "zod";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a valid date");

/** Longest window the dashboard will total (5 years): keeps one request bounded. */
export const MAX_DASHBOARD_RANGE_DAYS = 5 * 366;

/** GET /api/dashboard?from=&to= — both or neither (neither = the current month). */
export const dashboardQuerySchema = z
  .object({ from: day.optional(), to: day.optional() })
  .refine((q) => !!q.from === !!q.to, "Give both from and to, or neither")
  .refine((q) => !q.from || !q.to || q.from <= q.to, "'from' must be on or before 'to'")
  .refine(
    (q) => !q.from || !q.to || (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < MAX_DASHBOARD_RANGE_DAYS,
    "That date range is too long",
  );
