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
});

export type StopWorkInput = z.infer<typeof stopWorkSchema>;
