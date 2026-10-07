import { requireBusinessApi } from "@/lib/api-auth";
import { ApiHttpError, failureResponse } from "@/lib/api-error";
import { archiveOperator, updateOperator } from "@/lib/services/operators";
import { updateOperatorSchema } from "@/lib/validation/operator";
import { json, parseBody, withApi } from "@/lib/with-api";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApi("operators.update", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const input = await parseBody(req, updateOperatorSchema);
  const result = await updateOperator(auth.session.businessId, auth.actor, id, input);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true, version: result.version });
});

/** Soft-delete. Optional `?expectedVersion=` guards against archiving a record
 * that changed since the caller loaded it (older apps omit it). */
export const DELETE = withApi("operators.archive", async (req, { params }: Ctx) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { id } = await params;

  const raw = new URL(req.url).searchParams.get("expectedVersion");
  let expectedVersion: number | undefined;
  if (raw !== null) {
    expectedVersion = Number(raw);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new ApiHttpError("BAD_REQUEST", "expectedVersion must be a non-negative integer");
    }
  }

  const result = await archiveOperator(auth.session.businessId, auth.actor, id, expectedVersion);
  if ("error" in result) return failureResponse(result);
  return json({ ok: true });
});
