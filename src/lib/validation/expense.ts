import { z } from "zod";

export const EXPENSE_TYPES = ["DIESEL", "REPAIR", "SERVICE", "PARTS", "TYRES", "TRANSPORT", "OTHER"] as const;
export const EXPENSE_TYPE_LABEL: Record<(typeof EXPENSE_TYPES)[number], string> = {
  DIESEL: "Diesel",
  REPAIR: "Repair",
  SERVICE: "Service",
  PARTS: "Parts",
  TYRES: "Tyres / Tracks",
  TRANSPORT: "Transport",
  OTHER: "Other",
};

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Not a valid date");

/** POST /api/expenses */
export const createExpenseSchema = z.object({
  excavatorId: z.string().trim().min(1, "Choose a machine").max(128),
  date: day,
  type: z.enum(EXPENSE_TYPES),
  amount: z.number().positive("Enter the amount").max(1e9, "That amount looks wrong"),
  notes: z.string().trim().max(300, "Notes are too long").optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** GET /api/expenses?from=&to=&excavatorId= */
export const expenseListQuerySchema = z.object({
  from: day.optional(),
  to: day.optional(),
  excavatorId: z.string().trim().min(1).max(128).optional(),
});
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
