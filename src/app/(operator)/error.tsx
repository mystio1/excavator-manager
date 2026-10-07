"use client";

import ErrorBoundary from "../error";

export default function OperatorErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundary {...props} homeHref="/operator" />;
}
