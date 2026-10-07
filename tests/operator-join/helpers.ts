import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { requestOperatorJoin } from "@/lib/services/operators";
import type { TestTenant } from "../helpers/tenant";

/** A mobile number nobody else in the shared dev database is using. */
export function uniqueMobile(): string {
  return `9${randomInt(100_000_000, 999_999_999)}`;
}

/** Files a join request through the real service and returns what the
 * requester sees plus the stored request id. Throws if the service refuses. */
export async function fileJoinRequest(
  t: TestTenant,
  opts: { name?: string; mobile?: string; pin?: string; businessCode?: string } = {},
) {
  const mobile = opts.mobile ?? uniqueMobile();
  const result = await requestOperatorJoin(
    opts.businessCode ?? t.businessCode,
    opts.name ?? "New Driver",
    mobile,
    opts.pin ?? "4321",
  );
  if ("error" in result) throw new Error(`join request refused: ${result.error}`);
  const request = await db.operatorJoinRequest.findFirstOrThrow({
    where: { businessId: t.businessId, mobile, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  return { requestId: request.id, code: result.verificationCode, mobile, request };
}

/** A code that is guaranteed to differ from `code`. */
export function wrongCode(code: string): string {
  return code === "000000" ? "000001" : "000000";
}
