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

export const addTransactionSchema = z.object({
  operatorId: z.string().min(1),
  categoryId: z.string().optional(),
  newCategoryName: z.string().trim().optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Select a date"),
  notes: z.string().trim().optional(),
  deductFromSalary: z.coerce.boolean().optional(),
  businessEffect: z.enum(BUSINESS_EFFECTS),
});

export type AddTransactionInput = z.infer<typeof addTransactionSchema>;
