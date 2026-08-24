import { z } from "zod";

export const addCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter customer name"),
  mobile: z.string().trim().min(6, "Enter a valid mobile number"),
  companyName: z.string().trim().optional(),
  address: z.string().trim().optional(),
  gstNumber: z.string().trim().optional(),
});

export type AddCustomerInput = z.infer<typeof addCustomerSchema>;
