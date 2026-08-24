import { z } from "zod";

export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name"),
  ownerName: z.string().trim().min(1, "Enter the owner's name"),
  phone: z.string().trim().min(6, "Enter a valid phone number"),
  address: z.string().trim().optional(),
  gstNumber: z.string().trim().optional(),
  defaultServiceIntervalHrs: z.coerce.number().min(1, "Must be greater than 0"),
  maintenanceAlertThresholdHrs: z.coerce.number().min(1, "Must be greater than 0"),
});

const dataUrlOrEmpty = z
  .string()
  .refine((v) => v === "" || v.startsWith("data:image/"), "Invalid image")
  .optional();

export const billLetterheadSchema = z.object({
  logoLeftUrl: dataUrlOrEmpty,
  logoRightUrl: dataUrlOrEmpty,
  signatureUrl: dataUrlOrEmpty,
  billTagline: z.string().trim().optional(),
  billAccentColor: z.string().trim().min(1),
});

export const operatorLanguageSchema = z.object({
  operatorLanguage: z.enum(["en", "hi", "mr"]),
});

export const bankAccountSchema = z.object({
  label: z.string().trim().min(1, "Give this account a short label"),
  accountHolderName: z.string().trim().min(1, "Enter the account holder name"),
  accountNumber: z.string().trim().min(1, "Enter the account number"),
  ifsc: z.string().trim().min(1, "Enter the IFSC code"),
  bankName: z.string().trim().min(1, "Enter the bank name"),
  branch: z.string().trim().optional(),
  isDefaultForGst: z.coerce.boolean().optional(),
  isDefaultForNonGst: z.coerce.boolean().optional(),
});
