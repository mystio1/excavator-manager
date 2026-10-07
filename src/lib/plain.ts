import type { Prisma } from "@/generated/prisma/client";

/**
 * Shape of a service result AFTER JSON serialization: Prisma.Decimal fields
 * arrive on the client as plain numbers (see the toJSON patch in money.ts) and
 * Dates are revived by apiFetch. Client components that type their SWR data as
 * `Awaited<ReturnType<typeof someService>>` must wrap it:
 *
 *   type BillDetail = Plain<NonNullable<Awaited<ReturnType<typeof getBillDetail>>>>;
 */
export type Plain<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? Date
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;
