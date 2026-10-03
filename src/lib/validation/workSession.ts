import { z } from "zod";

// operatorId is never supplied here — it's derived server-side from
// Excavator.currentOperatorId (see startWork in workSessions.ts), since the
// operator<->machine pairing is set once from the Machine page, not re-picked
// every time a job starts.
export const startWorkSchema = z.object({
  excavatorId: z.string().min(1),
  customerId: z.string().min(1, "Select a customer"),
  siteName: z.string().trim().min(1, "Enter a site"),
  startDate: z.string().min(1, "Select a start date"),
  startHourMeter: z.coerce.number().min(0, "Must be 0 or more"),
  attachment: z.string().trim().optional(),
});

export type StartWorkInput = z.infer<typeof startWorkSchema>;

export const dailyLogSchema = z
  .object({
    workSessionId: z.string().min(1),
    date: z.string().min(1, "Select a date"),
    startHourMeter: z.coerce.number().min(0).optional(),
    endHourMeter: z.coerce.number().min(0).optional(),
    startTime: z.string().optional(),
    stopTime: z.string().optional(),
    breakMinutes: z.coerce.number().min(0).optional(),
    operatorName: z.string().trim().optional(),
    dieselLiters: z.coerce.number().positive("Must be greater than 0").optional(),
    notes: z.string().trim().optional(),
    attachment: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      (data.startHourMeter != null && data.endHourMeter != null) ||
      (!!data.startTime && !!data.stopTime),
    { message: "Enter either hour meter readings or start/stop time" },
  )
  .refine(
    (data) =>
      data.startHourMeter == null ||
      data.endHourMeter == null ||
      data.endHourMeter > data.startHourMeter,
    { message: "End hour meter must be greater than start hour meter" },
  );

export type DailyLogInput = z.infer<typeof dailyLogSchema>;

export const stopWorkSchema = z.object({
  workSessionId: z.string().min(1),
  endDate: z.string().min(1, "Select an end date"),
  endHourMeter: z.coerce.number().min(0, "Must be 0 or more"),
  dieselLiters: z.coerce.number().positive("Must be greater than 0").optional(),
  notes: z.string().trim().optional(),
});

export type StopWorkInput = z.infer<typeof stopWorkSchema>;

/** Admin correction of a whole job (any status). Hours are only taken from
 * here when the job has no approved daily readings — otherwise they stay
 * derived from those readings. */
export const updateWorkSessionSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  operatorId: z.string().min(1, "Select an operator"),
  siteName: z.string().trim().min(1, "Enter a site"),
  startDate: z.string().min(1, "Select a start date"),
  endDate: z.string().optional(),
  startHourMeter: z.coerce.number().min(0, "Must be 0 or more"),
  endHourMeter: z.coerce.number().min(0).optional(),
  totalHours: z.coerce.number().min(0).optional(),
  dieselLiters: z.coerce.number().min(0).optional(),
  attachment: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type UpdateWorkSessionInput = z.infer<typeof updateWorkSessionSchema>;
