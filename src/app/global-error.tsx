"use client";

/**
 * Last-resort boundary: renders when the ROOT layout itself fails, so it has to
 * bring its own <html>/<body> and cannot rely on the app's CSS or components.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fff7ea",
          color: "#17212b",
        }}
      >
        <div role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 16px", color: "#687385" }}>
            Excavator Manager couldn&rsquo;t load. Your data is safe. Please try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#f4a910",
              color: "#1a1207",
              border: 0,
              borderRadius: 10,
              padding: "12px 20px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && <p style={{ marginTop: 16, fontSize: 12, color: "#687385" }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
