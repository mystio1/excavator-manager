"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches runtime errors in any route segment below the root layout and shows
 * a calm fallback instead of a blank/crashed screen. The technical detail never
 * reaches the user — only the opaque `digest` (a reference to look up the
 * server log line) is shown.
 */
export default function ErrorBoundary({
  error,
  reset,
  homeHref = "/dashboard",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
}) {
  useEffect(() => {
    // Client-side only; server errors are logged by instrumentation.ts / withApi.
    console.error("UI error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold">This page hit a problem</h1>
      <p className="text-sm text-muted-foreground">
        Your data is safe. Try again, and if it keeps happening go back to the dashboard and reopen this page.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" nativeButton={false} render={<Link href={homeHref} />}>
          Go home
        </Button>
      </div>
      {error.digest && <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>}
    </div>
  );
}
