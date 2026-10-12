import { z } from "zod";
import { ATTACHMENT_VALUES, TOOL_REQUIRED_MESSAGE } from "@/lib/attachments";

/** The tool (attachment) is compulsory on every operator submission. Only the
 * canonical English values are accepted — the picker always sends those. */
export const toolField = z.enum(ATTACHMENT_VALUES, { message: TOOL_REQUIRED_MESSAGE });

/** A calendar day typed into a date input ("YYYY-MM-DD"). Stored as the UTC
 * midnight of that day — the same convention the daily-log date uses. */
export const workDateField = (message = "Enter a valid date") =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((v) => !Number.isNaN(Date.parse(v)), message);

/** True when a "YYYY-MM-DD" day is later than today anywhere on Earth. The
 * operator's local date can be up to 14 hours ahead of UTC (UTC-midnight of
 * "today" in UTC+14 is 14 h in the future), so anything within that window is
 * accepted; tomorrow-and-beyond is not. */
export function isFutureWorkDate(value: string, now = Date.now()): boolean {
  return Date.parse(value) > now + 14 * 60 * 60 * 1000;
}

const FUTURE_MESSAGE = "The work date can't be in the future";
const notFuture = { check: (v: string) => !isFutureWorkDate(v), message: FUTURE_MESSAGE };

const dieselFields = {
  dieselLiters: z.coerce.number().min(0, "Enter a valid amount").optional(),
  remainingDieselLiters: z.coerce.number().min(0).optional(),
  dieselDate: z.string().optional(),
  notes: z.string().trim().optional(),
};

export const startOperatorWorkSchema = z.object({
  startHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  /** The day the work was actually done (may be in the past, never the future). */
  startDate: workDateField("Enter the work date").refine(notFuture.check, notFuture.message),
  attachment: toolField,
  siteName: z.string().trim().optional(),
  ...dieselFields,
});

export type StartOperatorWorkInput = z.infer<typeof startOperatorWorkSchema>;

export const endOperatorWorkSchema = z.object({
  requestId: z.string().min(1),
  endHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  /** Optional: defaults to the work date. */
  endDate: workDateField("Enter a valid work end date").refine(notFuture.check, notFuture.message).optional(),
  /** Only needed when the job has no tool recorded yet. */
  attachment: toolField.optional(),
});

export type EndOperatorWorkInput = z.infer<typeof endOperatorWorkSchema>;

export const editOperatorWorkRequestSchema = z.object({
  requestId: z.string().min(1),
  startHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  endHourMeter: z.coerce.number().min(0).optional(),
  startDate: workDateField("Enter a valid work date").refine(notFuture.check, notFuture.message).optional(),
  endDate: workDateField("Enter a valid work end date").refine(notFuture.check, notFuture.message).optional(),
  attachment: toolField,
  siteName: z.string().trim().optional(),
  ...dieselFields,
});

export type EditOperatorWorkRequestInput = z.infer<typeof editOperatorWorkRequestSchema>;

// The Admin can correct every field the operator submitted (readings, work
// dates, tool, site, diesel, notes) on the way through approval — only the
// operator identity itself is fixed. A brand-new customer can be added
// inline (newCustomerName set) instead of picking an existing one. The tool is
// compulsory here too: an older request that has none must be given one.
const approveFields = {
  customerId: z.string().optional(),
  newCustomerName: z.string().trim().optional(),
  newCustomerMobile: z.string().trim().optional(),
  siteName: z.string().trim().min(1, "Enter a site"),
  startHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  endHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  /** Work dates; default to the request's own when omitted. */
  startDate: workDateField("Enter a valid work date").optional(),
  endDate: workDateField("Enter a valid work end date").optional(),
  attachment: toolField,
  ...dieselFields,
};

type ApproveCheckable = {
  startHourMeter: number;
  endHourMeter: number;
  startDate?: string;
  endDate?: string;
  customerId?: string;
  newCustomerName?: string;
};
const endAfterStart = {
  check: (data: ApproveCheckable) => data.endHourMeter > data.startHourMeter,
  params: {
    message: "End hour meter must be greater than the starting hour meter",
    path: ["endHourMeter"],
  },
};
const endDateNotBeforeStart = {
  check: (data: ApproveCheckable) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  params: { message: "The work end date can't be before the work date", path: ["endDate"] },
};
const hasCustomer = {
  check: (data: ApproveCheckable) => !!data.customerId || !!data.newCustomerName,
  params: { message: "Select a customer or add a new one", path: ["customerId"] },
};

export const approveWorkRequestSchema = z
  .object({ requestId: z.string().min(1), ...approveFields })
  .refine(endAfterStart.check, endAfterStart.params)
  .refine(endDateNotBeforeStart.check, endDateNotBeforeStart.params)
  .refine(hasCustomer.check, hasCustomer.params);

/** The POST body of /api/work-requests/[id]/approve — the request id comes from the URL. */
export const approveWorkRequestBodySchema = z
  .object(approveFields)
  .refine(endAfterStart.check, endAfterStart.params)
  .refine(endDateNotBeforeStart.check, endDateNotBeforeStart.params)
  .refine(hasCustomer.check, hasCustomer.params);

export type ApproveWorkRequestInput = z.infer<typeof approveWorkRequestSchema>;

export const rejectWorkRequestSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().optional(),
});

/** The POST body of /api/work-requests/[id]/reject — the request id comes from the URL. */
export const rejectWorkRequestBodySchema = z.object({ note: z.string().trim().optional() });

export type RejectWorkRequestInput = z.infer<typeof rejectWorkRequestSchema>;
