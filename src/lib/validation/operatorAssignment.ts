import { z } from "zod";

export const assignOperatorSchema = z.object({
  excavatorId: z.string().min(1),
  operatorId: z.string().min(1, "Select an operator"),
});

/** The POST body of /api/excavators/[id]/assign-operator — the machine id comes from the URL. */
export const assignOperatorBodySchema = z.object({
  operatorId: z.string().min(1, "Select an operator"),
});

export type AssignOperatorInput = z.infer<typeof assignOperatorSchema>;
