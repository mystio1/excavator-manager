import { z } from "zod";

// Shared with client components, so this file stays free of server-only helpers.

export const START_REASONS = ["RETURNED_FROM_LEAVE", "REJOINED_WORK", "OTHER"] as const;
export const START_REASON_LABEL: Record<(typeof START_REASONS)[number], string> = {
  RETURNED_FROM_LEAVE: "Returned from Leave",
  REJOINED_WORK: "Rejoined Work",
  OTHER: "Other",
};

export const LEAVE_TYPES = ["UNPAID", "PAID"] as const;
export const LEAVE_TYPE_LABEL: Record<(typeof LEAVE_TYPES)[number], string> = {
  UNPAID: "Unpaid Leave",
  PAID: "Paid Leave",
};

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Select a valid date")
  .refine((s) => !Number.isNaN(new Date(s.slice(0, 10)).getTime()), "Select a valid date");

const booleanFlag = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
const expectedVersion = z.number().int().min(0).optional();
const salary = z.coerce.number().min(0, "Must be 0 or more").max(1_000_000_000, "Salary is too large");

/** POST /api/operators/[id]/periods — start a new working period (closes the ACTIVE one atomically). */
export const startPeriodSchema = z.object({
  startDate: dayString,
  /** Last working day of the period being closed (default: the day before startDate). */
  previousEndDate: dayString.optional(),
  reason: z.enum(START_REASONS).optional(),
  reasonText: z.string().trim().max(500, "Reason is too long").optional(),
  /** Default: the operator's current monthly salary. */
  monthlySalary: salary.optional(),
  /** Required (true or false) only when the previous period has an outstanding balance; the amount is
   * always computed server-side. */
  carryForward: booleanFlag.optional(),
  /** Type of the leave recorded for the gap between the two periods (default UNPAID). */
  leaveType: z.enum(LEAVE_TYPES).optional(),
  notes: z.string().trim().max(1000, "Notes are too long").optional(),
  /** `version` of the ACTIVE period the client loaded (older/other clients may omit it). */
  expectedVersion,
});
export type StartPeriodInput = z.infer<typeof startPeriodSchema>;

/** PATCH /api/operators/[id]/periods/[periodId] — notes, close, or (with safeguards) edit dates. */
export const updatePeriodSchema = z
  .object({
    notes: z.string().trim().max(1000, "Notes are too long").nullable().optional(),
    startDate: dayString.optional(),
    endDate: dayString.optional(),
    /** Close the ACTIVE period without starting a new one (operator stopped working). `endDate` defaults to today. */
    close: z.boolean().optional(),
    expectedVersion,
  })
  .refine((v) => v.notes !== undefined || v.startDate || v.endDate || v.close, "Nothing to change");
export type UpdatePeriodInput = z.infer<typeof updatePeriodSchema>;

/** POST /api/operators/[id]/leaves */
export const createLeaveSchema = z
  .object({
    startDate: dayString,
    endDate: dayString,
    type: z.enum(LEAVE_TYPES).optional(),
    reason: z.string().trim().max(500, "Reason is too long").optional(),
  })
  .refine((v) => v.endDate.slice(0, 10) >= v.startDate.slice(0, 10), "End date cannot be before the start date");
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;

/** GET /api/operators/[id]/periods?previewStart=YYYY-MM-DD&previewEnd=YYYY-MM-DD */
export const previewStartSchema = z.object({ previewStart: dayString, previewEnd: dayString.optional() });
