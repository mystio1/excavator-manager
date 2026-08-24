import { z } from "zod";

export const addOperatorSchema = z.object({
  name: z.string().trim().min(1, "Enter operator name"),
  mobile: z.string().trim().min(6, "Enter a valid mobile number"),
  address: z.string().trim().optional(),
  joiningDate: z.string().optional(),
  defaultMonthlySalary: z.coerce.number().min(0, "Must be 0 or more").optional(),
});

export type AddOperatorInput = z.infer<typeof addOperatorSchema>;

// pin is optional here: the Admin can enable portal login without setting one,
// leaving the operator to activate their own PIN via /operator-signup.
export const setOperatorPinSchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits")
    .optional()
    .or(z.literal("")),
});

export type SetOperatorPinInput = z.infer<typeof setOperatorPinSchema>;

export const operatorSignupSchema = z
  .object({
    businessCode: z.string().trim().min(1, "Enter your business code"),
    name: z.string().trim().min(1, "Enter your name"),
    mobile: z.string().trim().min(6, "Enter a valid mobile number"),
    pin: z.string().trim().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
    confirmPin: z.string().trim(),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs don't match",
    path: ["confirmPin"],
  });

export type OperatorSignupInput = z.infer<typeof operatorSignupSchema>;
