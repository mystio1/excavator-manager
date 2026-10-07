"use client";

// Keeps the app shell (sidebar/header) on screen when a page inside it fails —
// the root boundary (src/app/error.tsx) would replace the whole layout.
import ErrorBoundary from "../error";

export default function AppErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundary {...props} />;
}
