import { z } from "zod";

/** A NEW PIN (set by the admin or chosen at signup): digits only, 4-8 long.
 * Existing 4-6 digit PINs keep working — operator login only requires 4+
 * characters, so widening this never locks anyone out. */
export const NEW_PIN_PATTERN = /^\d{4,8}$/;
export const NEW_PIN_MESSAGE = "PIN must be 4-8 digits";

/** The 6-digit code an operator is shown after requesting to join. */
export const JOIN_CODE_PATTERN = /^\d{6}$/;
export const JOIN_CODE_MESSAGE = "Enter the 6-digit verification code";

/** Optimistic concurrency: the `version` the client loaded (older apps omit it). */
const expectedVersion = z.number().int().min(0).optional();

const optionalDate = z
  .string()
  .optional()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), "Enter a valid date");

export const addOperatorSchema = z.object({
  name: z.string().trim().min(1, "Enter operator name").max(120, "Name is too long"),
  mobile: z.string().trim().min(6, "Enter a valid mobile number").max(20, "Enter a valid mobile number"),
  address: z.string().trim().max(500, "Address is too long").optional(),
  joiningDate: optionalDate,
  defaultMonthlySalary: z.coerce
    .number()
    .min(0, "Must be 0 or more")
    .max(1_000_000_000, "Salary is too large")
    .optional(),
});

export type AddOperatorInput = z.infer<typeof addOperatorSchema>;

export const updateOperatorSchema = addOperatorSchema.extend({ expectedVersion });

export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>;

// pin is optional here: the Admin can enable portal login without setting one,
// leaving the operator to activate their own PIN via /operator-signup. The
// format is only enforced when portal login is being enabled WITH a PIN (a
// "disable" request never needs one).
export const setOperatorPinSchema = z
  .object({
    canLogin: z.boolean(),
    pin: z.string().trim().optional(),
    expectedVersion,
  })
  .superRefine((data, ctx) => {
    if (data.canLogin && data.pin && !NEW_PIN_PATTERN.test(data.pin)) {
      ctx.addIssue({ code: "custom", path: ["pin"], message: NEW_PIN_MESSAGE });
    }
  });

export type SetOperatorPinInput = z.infer<typeof setOperatorPinSchema>;

export const operatorSignupSchema = z
  .object({
    businessCode: z.string().trim().min(1, "Enter your business code").max(20, "Invalid business code"),
    name: z.string().trim().min(1, "Enter your name").max(120, "Name is too long"),
    mobile: z.string().trim().min(6, "Enter a valid mobile number").max(20, "Enter a valid mobile number"),
    pin: z.string().trim().regex(NEW_PIN_PATTERN, NEW_PIN_MESSAGE),
    confirmPin: z.string().trim(),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs don't match",
    path: ["confirmPin"],
  });

export type OperatorSignupInput = z.infer<typeof operatorSignupSchema>;

/** Admin approving a join request. `code` is required for requests that carry a
 * verification code (everything filed after the redesign); legacy requests
 * approve without one. */
export const approveJoinRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(JOIN_CODE_PATTERN, JOIN_CODE_MESSAGE)
    .optional()
    .or(z.literal("")),
});

export type ApproveJoinRequestInput = z.infer<typeof approveJoinRequestSchema>;
