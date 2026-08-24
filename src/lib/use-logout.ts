"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

/** Replaces logoutAction (a Server Action) — unreachable from the Android
 * bundled build, which has no Next.js server backing its own origin to
 * post a Server Action to. */
export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } finally {
      setPending(false);
    }
  }

  return { logout, pending };
}
