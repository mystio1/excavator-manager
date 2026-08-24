import { z } from "zod";

export const generateDirectBillSchema = z
  .object({
    customerId: z.string().min(1),
    excavatorId: z.string().min(1, "Select a machine"),
    billDate: z.string().min(1),
    fromDate: z.string().min(1, "Select a start date"),
    toDate: z.string().min(1, "Select an end date"),
    bucketHours: z.coerce.number().min(0).default(0),
    bucketRate: z.coerce.number().min(0).default(0),
    breakerHours: z.coerce.number().min(0).default(0),
    breakerRate: z.coerce.number().min(0).default(0),
    transportCharges: z.coerce.number().min(0).default(0),
    dieselLiters: z.coerce.number().min(0).default(0),
    dieselPricePerLiter: z.coerce.number().min(0).default(0),
    billType: z.enum(["GST", "NON_GST"]),
    billNumber: z.string().trim().optional(),
    gstPercentage: z.coerce.number().min(0).max(28).optional(),
    buyerGstin: z.string().trim().optional(),
    bankAccountId: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    showCustomerPhone: z.boolean().default(true),
  })
  .refine((data) => data.billType !== "GST" || !!data.billNumber, {
    message: "Enter a GST bill number",
    path: ["billNumber"],
  })
  .refine((data) => data.billType !== "GST" || data.gstPercentage != null, {
    message: "Select a GST rate",
    path: ["gstPercentage"],
  })
  .refine(
    (data) =>
      data.bucketHours * data.bucketRate + data.breakerHours * data.breakerRate + data.transportCharges > 0,
    { message: "Enter bucket hours, breaker hours, or transport charges", path: ["bucketHours"] },
  )
  .refine((data) => new Date(data.toDate) >= new Date(data.fromDate), {
    message: "End date must be on or after the start date",
    path: ["toDate"],
  });

export type GenerateDirectBillInput = z.infer<typeof generateDirectBillSchema>;
