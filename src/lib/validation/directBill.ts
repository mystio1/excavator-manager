import { z } from "zod";
import { MAX_HOURS, MAX_MONEY } from "@/lib/validation/bill";

const money = () => z.coerce.number().min(0).max(MAX_MONEY, "That amount is too large");
const hours = () => z.coerce.number().min(0).max(MAX_HOURS, "That many hours is too large");

const dateField = (emptyMessage?: string) =>
  z
    .string()
    .min(1, emptyMessage)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date");

export const generateDirectBillSchema = z
  .object({
    customerId: z.string().min(1),
    excavatorId: z.string().min(1, "Select a machine"),
    billDate: dateField(),
    fromDate: dateField("Select a start date"),
    toDate: dateField("Select an end date"),
    bucketHours: hours().default(0),
    bucketRate: money().default(0),
    breakerHours: hours().default(0),
    breakerRate: money().default(0),
    transportCharges: money().default(0),
    dieselLiters: hours().default(0),
    dieselPricePerLiter: money().default(0),
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
    // Hours × rate is evaluated in the service with exact decimals; this is
    // only the "something to bill" guard, where a float product > 0 test is safe.
    (data) =>
      data.bucketHours * data.bucketRate + data.breakerHours * data.breakerRate + data.transportCharges > 0,
    { message: "Enter bucket hours, breaker hours, or transport charges", path: ["bucketHours"] },
  )
  .refine((data) => new Date(data.toDate) >= new Date(data.fromDate), {
    message: "End date must be on or after the start date",
    path: ["toDate"],
  });

export type GenerateDirectBillInput = z.infer<typeof generateDirectBillSchema>;
