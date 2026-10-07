"use client";

import { useSWRConfig } from "swr";

/**
 * Returns a function that drops EVERY cached SWR entry without refetching.
 *
 * Why: the SWR cache lives in memory for the whole page session, and sign-in /
 * sign-out are client-side navigations (no reload). Without this, user B who logs in
 * right after user A in the same tab (or the same Android WebView) can briefly be
 * shown A's cached layout/dashboard data — a cross-account leak on shared devices.
 * Call it after a successful sign-in/sign-up and after sign-out, before navigating.
 */
export function useClearClientCache() {
  const { mutate } = useSWRConfig();
  return () => mutate(() => true, undefined, { revalidate: false });
}
