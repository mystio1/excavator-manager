"use client";

import { useState } from "react";
import { ApiError, newIdempotencyKey } from "@/lib/api-client";

/** One Idempotency-Key per logical submission of a create form (bill, summary
 * bill, direct bill, payment).
 *
 *   const idem = useIdempotencyKey();
 *   await idem.submit((key) => apiFetch(path, { method: "POST", body, idempotencyKey: key }));
 *
 * The key is created when the form mounts and KEPT across failures, so tapping
 * "Save" again after a timeout re-sends the same key and the server replays the
 * first outcome instead of creating a second bill/payment. After a success the
 * key is replaced, so the next submission is a genuinely new one. */
export function useIdempotencyKey() {
  const [key, setKey] = useState(newIdempotencyKey);

  async function submit<T>(send: (idempotencyKey: string) => Promise<T>): Promise<T> {
    try {
      const result = await send(key);
      setKey(newIdempotencyKey());
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_REUSED") {
        // The same submission was already saved, and the form has since been
        // changed. Start a fresh key (so the user is not stuck) and say what
        // happened in words a person can act on.
        setKey(newIdempotencyKey());
        throw new ApiError(
          "This may already have been saved — check the list before submitting it again.",
          error.status,
          { code: error.code, requestId: error.requestId },
        );
      }
      throw error;
    }
  }

  return { key, submit };
}
