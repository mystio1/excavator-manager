import { z } from "zod";

export const generateBillSchema = z
  .object({
    customerId: z.string().min(1),
    workSessionIds: z.array(z.string().min(1)).min(1, "Select at least one work record"),
    attachment: z.string().trim().optional(),
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

const chargeFields = {
  transportCharges: z.coerce.number().min(0).default(0),
  fuelCharges: z.coerce.number().min(0).default(0),
  extraCharges: z.coerce.number().min(0).default(0),
  bucketCharge: z.coerce.number().min(0).default(0),
  breakerCharge: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
};

/** One line of a bill typed in by hand (Summary Bill / bill edit). `id` is
 * only present when editing an existing line, so its link back to the
 * underlying WorkSession (if any) survives the edit. */
export const billItemInputSchema = z
  .object({
    id: z.string().optional(),
    excavatorId: z.string().min(1, "Select a machine on every row"),
    siteName: z.string().trim().min(1, "Enter a site on every row"),
    attachment: z.string().trim().optional(),
    fromDate: z.string().min(1, "Enter a date on every row"),
    toDate: z.string().min(1, "Enter a date on every row"),
    hours: z.coerce.number().min(0, "Hours must be 0 or more"),
    ratePerHour: z.coerce.number().min(0, "Rate must be 0 or more"),
  })
  .refine((i) => new Date(i.toDate) >= new Date(i.fromDate), {
    message: "A row's end date is before its start date",
  });

export type BillItemInput = z.infer<typeof billItemInputSchema>;

/** Summary Bill — a normal (non-direct) bill whose lines are typed in
 * directly, so no logged WorkSessions are needed. */
export const generateSummaryBillSchema = z
  .object({
    customerId: z.string().min(1),
    billDate: z.string().min(1),
    items: z.array(billItemInputSchema).min(1, "Add at least one row"),
    ...chargeFields,
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

export type GenerateSummaryBillInput = z.infer<typeof generateSummaryBillSchema>;

/** Admin edit of an already-generated bill — everything can change. Normal /
 * summary bills send `items`; direct bills send the direct-bill fields. */
export const updateBillSchema = z
  .object({
    customerId: z.string().min(1),
    billDate: z.string().min(1),
    billNumber: z.string().trim().min(1, "Enter a bill number"),
    items: z.array(billItemInputSchema).optional(),
    ...chargeFields,
    billType: z.enum(["GST", "NON_GST"]),
    gstPercentage: z.coerce.number().min(0).max(28).optional(),
    buyerGstin: z.string().trim().optional(),
    bankAccountId: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    showCustomerPhone: z.boolean().default(true),
    // Direct-bill-only fields
    excavatorId: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    bucketHours: z.coerce.number().min(0).default(0),
    bucketRate: z.coerce.number().min(0).default(0),
    breakerHours: z.coerce.number().min(0).default(0),
    breakerRate: z.coerce.number().min(0).default(0),
    dieselLiters: z.coerce.number().min(0).default(0),
    dieselPricePerLiter: z.coerce.number().min(0).default(0),
  })
  .refine((data) => data.billType !== "GST" || data.gstPercentage != null, {
    message: "Select a GST rate",
    path: ["gstPercentage"],
  });

export type UpdateBillInput = z.infer<typeof updateBillSchema>;

export const addPaymentSchema = z.object({
  billId: z.string().min(1),
  amount: z.coerce.number().min(1, "Enter an amount greater than 0"),
  date: z.string().min(1),
  method: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
