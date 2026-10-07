import fs from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mutate, useSWRConfig } from "swr";
import { useClearClientCache } from "@/lib/use-clear-client-cache";

/**
 * Sign-in and sign-out are client-side navigations, so the in-memory SWR cache outlives
 * the session. Without clearing it, the next account to sign in on the same tab/WebView
 * can be shown the previous account's cached data.
 */
describe("client cache isolation between accounts", () => {
  it("useClearClientCache drops every cached entry and does not refetch", async () => {
    await mutate("/api/layout", { business: "Account A" }, { revalidate: false });
    await mutate("/api/dashboard", { total: 123 }, { revalidate: false });

    let cache!: ReturnType<typeof useSWRConfig>["cache"];
    let clear!: () => Promise<unknown>;
    renderToString(
      createElement(function Probe() {
        cache = useSWRConfig().cache;
        clear = useClearClientCache();
        return null;
      }),
    );

    expect(cache.get("/api/layout")?.data).toEqual({ business: "Account A" });
    await clear();
    expect(cache.get("/api/layout")?.data).toBeUndefined();
    expect(cache.get("/api/dashboard")?.data).toBeUndefined();
  });

  // Regression guard: every place that starts or ends a session in the UI must clear it.
  it.each([
    "src/lib/use-logout.ts",
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/register/page.tsx",
    "src/app/(operator-auth)/operator-login/page.tsx",
    "src/app/(operator-auth)/operator-signup/page.tsx",
  ])("%s clears the client cache before navigating", (file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain("useClearClientCache");
    expect(src).toMatch(/await clearClientCache\(\)/);
  });

  // The two flows that hard-navigate (full reload) need no clearing; assert they still do.
  it.each(["src/app/(app)/settings/change-password-card.tsx", "src/app/(app)/settings/sign-out-everywhere-card.tsx"])(
    "%s hard-navigates to /login (a reload drops all client state)",
    (file) => {
      expect(fs.readFileSync(file, "utf8")).toContain('window.location.href = "/login"');
    },
  );
});
