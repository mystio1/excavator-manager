"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { PIN_UNLOCKED_KEY } from "@/lib/appLock";

/** Replaces logoutAction (a Server Action) — unreachable from the Android
 * bundled build, which has no Next.js server backing its own origin to
 * post a Server Action to. */
export function useLogout(redirectTo: string = "/login") {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      // Otherwise logging back in on the same tab would skip the app-lock
      // PIN screen — sessionStorage outlives logout, only cleared when the
      // tab itself closes.
      try {
        sessionStorage.removeItem(PIN_UNLOCKED_KEY);
      } catch {
        // Private-browsing/storage-blocked — nothing to clear either way.
      }
      router.push(redirectTo);
    } finally {
      setPending(false);
    }
  }

  return { logout, pending };
}
