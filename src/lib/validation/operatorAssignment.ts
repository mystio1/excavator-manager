import { z } from "zod";

export const assignOperatorSchema = z.object({
  excavatorId: z.string().min(1),
  operatorId: z.string().min(1, "Select an operator"),
});

export type AssignOperatorInput = z.infer<typeof assignOperatorSchema>;
