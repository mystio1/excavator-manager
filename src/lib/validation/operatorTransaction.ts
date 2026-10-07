import { z } from "zod";

export const BUSINESS_EFFECTS = [
  "ADVANCE_RECOVERABLE",
  "BUSINESS_EXPENSE",
  "SALARY_PAYMENT",
  "BONUS_INCENTIVE",
  "OTHER",
] as const;

export const BUSINESS_EFFECT_LABEL: Record<(typeof BUSINESS_EFFECTS)[number], string> = {
  ADVANCE_RECOVERABLE: "Operator Advance / Recoverable",
  BUSINESS_EXPENSE: "Business Expense",
  SALARY_PAYMENT: "Salary Payment",
  BONUS_INCENTIVE: "Bonus / Incentive",
  OTHER: "Other",
};

export const DEFAULT_TRANSACTION_CATEGORIES = [
  "Salary Advance",
  "Personal Advance",
  "Food",
  "Vegetables",
  "Fuel",
  "Medical",
  "Loan",
  "Bonus",
  "Incentive",
  "Extra Work Payment",
  "Other",
];

// The amount column is NUMERIC(14,2): at most 12 integer digits and 2 decimals.
// Anything finer than a paisa is rejected up front instead of being silently
// rounded away (this file is imported by client components too, so it stays
// free of the Decimal helpers in money.ts — the service does the exact math).
const MAX_AMOUNT = 999_999_999_999.99;
const amountSchema = z.coerce
  .number()
  .positive("Amount must be greater than 0")
  .max(MAX_AMOUNT, "Amount is too large")
  .refine((n) => Number(n.toFixed(2)) === n, "Amount can have at most 2 decimal places");

// "true"/"false" strings must not be coerced through Boolean() ("false" is a
// non-empty string and would silently become true — a deduction nobody asked for).
const booleanFlag = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);

// Every field a transaction form submits (the operator comes from the URL).
const transactionFields = {
  categoryId: z.string().optional(),
  newCategoryName: z.string().trim().max(80, "Category name is too long").optional(),
  amount: amountSchema,
  date: z
    .string()
    .min(1, "Select a date")
    .refine((s) => !Number.isNaN(new Date(s).getTime()), "Select a valid date"),
  notes: z.string().trim().max(1000, "Notes are too long").optional(),
  deductFromSalary: booleanFlag.optional(),
  businessEffect: z.enum(BUSINESS_EFFECTS),
};

export const addTransactionSchema = z.object({
  operatorId: z.string().min(1),
  ...transactionFields,
});

export type AddTransactionInput = z.infer<typeof addTransactionSchema>;

/** The POST body of /api/operators/[id]/transactions — the operator id comes
 * from the URL, never from the body. */
export const createTransactionBodySchema = z.object(transactionFields);

export const updateTransactionSchema = z.object({
  ...transactionFields,
  // Optimistic concurrency: the `version` of the transaction the client loaded.
  // Omitted by older installed apps, which skips the check.
  expectedVersion: z.number().int().min(0).optional(),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
