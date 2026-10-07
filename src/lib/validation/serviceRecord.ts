import { z } from "zod";
import { dateString } from "@/lib/validation/workSession";

export const COMPONENT_CATEGORIES = [
  "Engine",
  "Hydraulic System",
  "Undercarriage",
  "Boom and Arm",
  "Bucket",
  "Electrical System",
  "Cabin",
  "Other",
] as const;

export const SERVICE_ACTIONS = [
  "Inspected",
  "Serviced",
  "Repaired",
  "Replaced",
  "Changed",
  "Cleaned",
  "Greased",
  "Not Done",
  "Not Required",
  "Other",
] as const;

export const NOT_ACTIONED = new Set(["Not Done", "Not Required"]);

export const addComponentSchema = z.object({
  name: z.string().trim().min(1, "Enter a component name"),
  category: z.enum(COMPONENT_CATEGORIES),
});

export type AddComponentInput = z.infer<typeof addComponentSchema>;

const serviceItemRowSchema = z.object({
  serviceItemId: z.string().min(1),
  action: z.enum(SERVICE_ACTIONS),
  // Per-line cost is stored as NUMERIC(14,2): the service converts it with
  // dec()/round2() (never float arithmetic). The ceiling keeps a typo from
  // overflowing the column once many lines are summed.
  cost: z.coerce.number().min(0).max(99_999_999).default(0),
  brand: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const createServiceRecordSchema = z.object({
  excavatorId: z.string().min(1),
  serviceDate: dateString("Select a service date"),
  hourMeterAtService: z.coerce.number().min(0, "Must be 0 or more").max(10_000_000),
  notes: z.string().trim().optional(),
  items: z.array(serviceItemRowSchema).min(1, "Select at least one component").max(200),
});

export type CreateServiceRecordInput = z.infer<typeof createServiceRecordSchema>;
