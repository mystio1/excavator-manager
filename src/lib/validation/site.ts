import { z } from "zod";

export const SITE_TYPES = ["CUSTOMER_SITE", "SELF_SITE"] as const;
export const SITE_STATUSES = ["ACTIVE", "COMPLETED", "ON_HOLD"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a valid date");

/** "" (an empty form field) is treated as "not provided". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Value is too long")
    .optional()
    .transform((v) => (v ? v : undefined));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(isoDate.optional());

const rate = z.number("Enter a number").min(0, "Rate cannot be negative").max(99_999_999, "Rate is too large");

export const siteTypeSchema = z.enum(SITE_TYPES);
export const siteStatusSchema = z.enum(SITE_STATUSES);

export const createSiteSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the site name").max(200, "Site name is too long"),
    type: siteTypeSchema.default("CUSTOMER_SITE"),
    customerId: z.string().trim().max(128).nullish(),
    address: z.string().trim().max(500, "Location is too long").nullish(),
    status: siteStatusSchema.default("ACTIVE"),
    bucketRate: rate.nullish(),
    breakerRate: rate.nullish(),
  })
  .refine((v) => v.type === "SELF_SITE" || !!v.customerId, {
    path: ["customerId"],
    message: "Choose the customer for this site",
  });
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

/** PATCH /api/sites/[id]: site basics. Rates have their own endpoint (they are effective-dated). */
export const updateSiteSchema = z.object({
  name: z.string().trim().min(1, "Enter the site name").max(200, "Site name is too long").optional(),
  type: siteTypeSchema.optional(),
  customerId: z.string().trim().max(128).nullish(),
  address: z.string().trim().max(500, "Location is too long").nullish(),
  status: siteStatusSchema.optional(),
  expectedVersion: z.number().int().min(0).nullish(),
});
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

/** PATCH /api/sites/[id]/rates. `effectiveFrom` defaults to today. */
export const updateSiteRatesSchema = z.object({
  bucketRate: rate.nullable(),
  breakerRate: rate.nullable(),
  effectiveFrom: optionalDate,
  expectedVersion: z.number().int().min(0).nullish(),
});
export type UpdateSiteRatesInput = z.infer<typeof updateSiteRatesSchema>;

const pageNumber = z.coerce.number().int().min(1).max(100_000);
const pageSize = z.coerce.number().int().min(1).max(100);

/** GET /api/sites */
export const siteListQuerySchema = z.object({
  q: optionalText(100),
  type: siteTypeSchema.optional(),
  status: siteStatusSchema.optional(),
  excavatorId: optionalText(128),
  from: optionalDate,
  to: optionalDate,
  page: pageNumber.optional(),
  pageSize: pageSize.optional(),
});

/** GET /api/sites/[id]/analysis | daily | diesel */
export const siteAnalysisQuerySchema = z.object({
  excavatorId: optionalText(128),
  from: optionalDate,
  to: optionalDate,
  page: pageNumber.optional(),
  pageSize: pageSize.optional(),
});
