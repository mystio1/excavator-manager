import { z } from "zod";

const dieselFields = {
  dieselLiters: z.coerce.number().min(0, "Enter a valid amount").optional(),
  dieselDate: z.string().optional(),
  notes: z.string().trim().optional(),
};

export const startOperatorWorkSchema = z.object({
  startHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  attachment: z.string().trim().optional(),
  siteName: z.string().trim().optional(),
  ...dieselFields,
});

export type StartOperatorWorkInput = z.infer<typeof startOperatorWorkSchema>;

export const endOperatorWorkSchema = z.object({
  requestId: z.string().min(1),
  endHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
});

export type EndOperatorWorkInput = z.infer<typeof endOperatorWorkSchema>;

export const editOperatorWorkRequestSchema = z.object({
  requestId: z.string().min(1),
  startHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  endHourMeter: z.coerce.number().min(0).optional(),
  attachment: z.string().trim().optional(),
  siteName: z.string().trim().optional(),
  ...dieselFields,
});

export type EditOperatorWorkRequestInput = z.infer<typeof editOperatorWorkRequestSchema>;

// The Admin can correct every field the operator submitted (readings,
// attachment, site, diesel, notes) on the way through approval — only the
// operator identity itself is fixed. A brand-new customer can be added
// inline (newCustomerName set) instead of picking an existing one.
const approveFields = {
  customerId: z.string().optional(),
  newCustomerName: z.string().trim().optional(),
  newCustomerMobile: z.string().trim().optional(),
  siteName: z.string().trim().min(1, "Enter a site"),
  startHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  endHourMeter: z.coerce.number().min(0, "Enter a valid reading"),
  attachment: z.string().trim().optional(),
  ...dieselFields,
};

type ApproveCheckable = { startHourMeter: number; endHourMeter: number; customerId?: string; newCustomerName?: string };
const endAfterStart = {
  check: (data: ApproveCheckable) => data.endHourMeter > data.startHourMeter,
  params: {
    message: "End hour meter must be greater than the starting hour meter",
    path: ["endHourMeter"],
  },
};
const hasCustomer = {
  check: (data: ApproveCheckable) => !!data.customerId || !!data.newCustomerName,
  params: { message: "Select a customer or add a new one", path: ["customerId"] },
};

export const approveWorkRequestSchema = z
  .object({ requestId: z.string().min(1), ...approveFields })
  .refine(endAfterStart.check, endAfterStart.params)
  .refine(hasCustomer.check, hasCustomer.params);

/** The POST body of /api/work-requests/[id]/approve — the request id comes from the URL. */
export const approveWorkRequestBodySchema = z
  .object(approveFields)
  .refine(endAfterStart.check, endAfterStart.params)
  .refine(hasCustomer.check, hasCustomer.params);

export type ApproveWorkRequestInput = z.infer<typeof approveWorkRequestSchema>;

export const rejectWorkRequestSchema = z.object({
  requestId: z.string().min(1),
  note: z.string().trim().optional(),
});

/** The POST body of /api/work-requests/[id]/reject — the request id comes from the URL. */
export const rejectWorkRequestBodySchema = z.object({ note: z.string().trim().optional() });

export type RejectWorkRequestInput = z.infer<typeof rejectWorkRequestSchema>;
