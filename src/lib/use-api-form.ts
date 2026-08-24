"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";

/**
 * Client-side replacement for the useActionState + Server Action pattern
 * used throughout this app's dialogs. Every one of those followed the same
 * shape: submit, show a pending label, show state.error inline on failure,
 * auto-close on success. This reproduces that exact UX against a plain
 * async submit function (usually an apiFetch call) instead of a Server
 * Action, since Server Actions can't be reached from the Android bundled
 * build (no Next.js server backs that origin).
 */
export function useApiForm<T>(submit: (data: T) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(data: T): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await submit(data);
      return true;
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { error, pending, run };
}
