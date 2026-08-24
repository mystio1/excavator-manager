import { z } from "zod";

export const generateBillSchema = z
  .object({
    customerId: z.string().min(1),
    workSessionIds: z.array(z.string().min(1)).min(1, "Select at least one work record"),
    billDate: z.string().min(1),
    ratePerHour: z.coerce.number().min(0, "Must be 0 or more"),
    transportCharges: z.coerce.number().min(0).default(0),
    fuelCharges: z.coerce.number().min(0).default(0),
    extraCharges: z.coerce.number().min(0).default(0),
    bucketCharge: z.coerce.number().min(0).default(0),
    breakerCharge: z.coerce.number().min(0).default(0),
    discount: z.coerce.number().min(0).default(0),
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
  });

export type GenerateBillInput = z.infer<typeof generateBillSchema>;

export const addPaymentSchema = z.object({
  billId: z.string().min(1),
  amount: z.coerce.number().min(1, "Enter an amount greater than 0"),
  date: z.string().min(1),
  method: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
