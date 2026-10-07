import { z } from "zod";

const businessCode = z.string().trim().min(1, "Enter a business code").max(40, "Enter a valid business code");
/** Why support is doing this: REQUIRED on every action that touches a business, and
 * stored in that business's audit log (the one shared support credential has no
 * individual to name, so the reason is the accountability). */
export const MIN_SUPPORT_REASON = 5;
const reason = z
  .string()
  .trim()
  .min(MIN_SUPPORT_REASON, "Enter a reason (at least 5 characters)")
  .max(500, "Keep the reason under 500 characters");

export const supportLoginSchema = z.object({
  password: z.string().max(1024),
});

export const supportBusinessSchema = z.object({ businessCode, reason });

export const supportFreezeSchema = z.object({
  businessCode,
  frozen: z.boolean(),
  reason,
});

// null / "" / absent all mean "unlimited"; the service validates real values.
const limitInput = z.union([z.string(), z.number(), z.null()]).optional();

export const supportLimitsSchema = z.object({
  businessCode,
  maxOperators: limitInput,
  maxBillsPerDay: limitInput,
  reason,
});

export const supportClearDataSchema = z.object({
  businessCode,
  // Re-checked server-side against businessCode — this deletes data with no undo.
  confirmCode: z.string().max(40),
  reason,
});
