import { z } from "zod";

export const addCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter customer name").max(200, "Customer name is too long"),
  mobile: z.string().trim().min(6, "Enter a valid mobile number").max(30, "Mobile number is too long"),
  companyName: z.string().trim().max(200, "Company name is too long").optional(),
  address: z.string().trim().max(500, "Address is too long").optional(),
  gstNumber: z.string().trim().max(30, "GST number is too long").optional(),
});

export type AddCustomerInput = z.infer<typeof addCustomerSchema>;

/** PATCH /api/customers/[id]. `expectedVersion` is the `version` the client
 * loaded (optimistic concurrency); older apps omit it and skip the check. */
export const updateCustomerSchema = addCustomerSchema.extend({
  expectedVersion: z.number().int().min(0).nullish(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a valid date");

/** "" (an empty form field) is treated the same as "not provided". */
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

/** GET /api/customers?q=&tripDate= (pagination is parsed by parsePagination). */
export const customerListQuerySchema = z.object({
  q: optionalText(100),
  tripDate: optionalDate,
});

/** GET /api/customers/detail?id=&excavatorId=&site=&from=&to= */
export const customerDetailQuerySchema = z.object({
  id: z.string("Customer id is required").trim().min(1, "Customer id is required").max(128),
  excavatorId: optionalText(128),
  site: optionalText(200),
  from: optionalDate,
  to: optionalDate,
});
