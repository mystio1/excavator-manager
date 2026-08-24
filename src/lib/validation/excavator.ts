import { z } from "zod";

export const addExcavatorSchema = z.object({
  name: z.string().trim().min(1, "Enter a machine name"),
  machineNumber: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  model: z.string().trim().optional(),
  purchaseDate: z.string().optional(),
  startingHourMeter: z.coerce.number().min(0, "Must be 0 or more"),
  serviceIntervalHrs: z.coerce.number().min(1, "Must be greater than 0").optional(),
});

export type AddExcavatorInput = z.infer<typeof addExcavatorSchema>;

// Starting hour meter is intentionally not editable after creation — it
// anchors service-due math and work history, so it stays fixed.
export const editExcavatorSchema = addExcavatorSchema
  .omit({ startingHourMeter: true })
  .extend({ startingHourMeter: z.coerce.number().min(0).optional() });

export type EditExcavatorInput = z.infer<typeof editExcavatorSchema>;

export const setExcavatorSiteSchema = z.object({
  excavatorId: z.string().min(1),
  siteName: z.string().trim().min(1, "Enter a site"),
});

export type SetExcavatorSiteInput = z.infer<typeof setExcavatorSiteSchema>;
