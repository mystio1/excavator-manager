import { z } from "zod";

/** A calendar date typed into an <input type="date"> ("YYYY-MM-DD") or an ISO
 * timestamp. Rejecting anything Date can't parse here means a garbage string is
 * a clean 422 instead of an "Invalid Date" blowing up inside a database write. */
export const dateString = (requiredMessage = "Select a date") =>
  z
    .string()
    .min(1, requiredMessage)
    .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date");

/** The `version` of the record the client loaded (see docs/api-conventions.md
 * §6). Optional so installed Android apps that don't send it keep working. */
export const expectedVersionField = z.number().int().min(0).optional();

/** `?expectedVersion=3` on requests that have no body to carry it (DELETE,
 * approve/reject). A ZodError here becomes a 422 via withApi. */
export function expectedVersionFromQuery(req: Request): number | undefined {
  const raw = new URL(req.url).searchParams.get("expectedVersion");
  return raw === null || raw === "" ? undefined : expectedVersionField.parse(Number(raw));
}

// Sanity ceilings — far beyond any real machine, but keep a typo ("1e9") from
// reaching a Float column or the maintenance maths.
const MAX_HOURS = 10_000_000;
const MAX_LITERS = 100_000;

// operatorId is never supplied here — it's derived server-side from
// Excavator.currentOperatorId (see startWork in workSessions.ts), since the
// operator<->machine pairing is set once from the Machine page, not re-picked
// every time a job starts.
export const startWorkSchema = z.object({
  excavatorId: z.string().min(1),
  customerId: z.string().min(1, "Select a customer"),
  siteName: z.string().trim().min(1, "Enter a site"),
  startDate: dateString("Select a start date"),
  startHourMeter: z.coerce.number().min(0, "Must be 0 or more").max(MAX_HOURS),
  attachment: z.string().trim().optional(),
});

export type StartWorkInput = z.infer<typeof startWorkSchema>;

// "HH:MM" (or "HH:MM:SS") as an <input type="time"> sends it; "" means unset.
// Anything else would turn into NaN hours inside calcHoursFromClock.
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const timeField = z
  .string()
  .optional()
  .refine((value) => !value || TIME_RE.test(value), "Enter a valid time (HH:MM)");

// Shared by the add (admin), submit (operator) and edit (admin) paths. Edit
// additionally carries expectedVersion; add/submit carry workSessionId.
const dailyLogFields = {
  date: dateString("Select a date"),
  startHourMeter: z.coerce.number().min(0).max(MAX_HOURS).optional(),
  endHourMeter: z.coerce.number().min(0).max(MAX_HOURS).optional(),
  startTime: timeField,
  stopTime: timeField,
  breakMinutes: z.coerce.number().int("Must be a whole number").min(0).max(1440).optional(),
  operatorName: z.string().trim().optional(),
  dieselLiters: z.coerce.number().positive("Must be greater than 0").max(MAX_LITERS).optional(),
  notes: z.string().trim().optional(),
  attachment: z.string().trim().optional(),
};

type DailyLogRuleInput = {
  startHourMeter?: number;
  endHourMeter?: number;
  startTime?: string;
  stopTime?: string;
};

const hasReadingOrTimes = (data: DailyLogRuleInput) =>
  (data.startHourMeter != null && data.endHourMeter != null) || (!!data.startTime && !!data.stopTime);

const endAfterStart = (data: DailyLogRuleInput) =>
  data.startHourMeter == null || data.endHourMeter == null || data.endHourMeter > data.startHourMeter;

export const dailyLogSchema = z
  .object({ workSessionId: z.string().min(1), ...dailyLogFields })
  .refine(hasReadingOrTimes, { message: "Enter either hour meter readings or start/stop time" })
  .refine(endAfterStart, { message: "End hour meter must be greater than start hour meter" });

export type DailyLogInput = z.infer<typeof dailyLogSchema>;

/** Admin correction of one reading. The session is derived from the log id in
 * the URL, so no workSessionId here. */
export const updateDailyLogSchema = z
  .object({ ...dailyLogFields, expectedVersion: expectedVersionField })
  .refine(hasReadingOrTimes, { message: "Enter either hour meter readings or start/stop time" })
  .refine(endAfterStart, { message: "End hour meter must be greater than start hour meter" });

export type UpdateDailyLogInput = z.infer<typeof updateDailyLogSchema>;

export const stopWorkSchema = z.object({
  workSessionId: z.string().min(1),
  endDate: dateString("Select an end date"),
  endHourMeter: z.coerce.number().min(0, "Must be 0 or more").max(MAX_HOURS),
  dieselLiters: z.coerce.number().positive("Must be greater than 0").max(MAX_LITERS).optional(),
  notes: z.string().trim().optional(),
  expectedVersion: expectedVersionField,
});

export type StopWorkInput = z.infer<typeof stopWorkSchema>;

/** Admin correction of a whole job (any status). Hours are only taken from
 * here when the job has no approved daily readings — otherwise they stay
 * derived from those readings. */
export const updateWorkSessionSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  operatorId: z.string().min(1, "Select an operator"),
  siteName: z.string().trim().min(1, "Enter a site"),
  startDate: dateString("Select a start date"),
  endDate: z.string().optional().refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  startHourMeter: z.coerce.number().min(0, "Must be 0 or more").max(MAX_HOURS),
  endHourMeter: z.coerce.number().min(0).max(MAX_HOURS).optional(),
  totalHours: z.coerce.number().min(0).max(MAX_HOURS).optional(),
  dieselLiters: z.coerce.number().min(0).max(MAX_LITERS).optional(),
  attachment: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  expectedVersion: expectedVersionField,
});

export type UpdateWorkSessionInput = z.infer<typeof updateWorkSessionSchema>;
