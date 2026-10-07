# ADR-0005: One codebase for web and Android (static export + remote API)

Status: accepted

## Context
Owners and operators use the product on phones. A separate native codebase was
not affordable; the web app already exists.

## Decision
Capacitor wraps a **static export** of the Next.js app (`output: "export"`,
built by `scripts/build-android.mjs`) and calls the deployed API cross-origin.
The live web deployment is the regular Next.js server build. Consequences we
accept:

* Every page is a client component that fetches JSON (no Server Components /
  Server Actions in the app UI); this is why the UI uses SWR everywhere.
* API routes, `proxy.ts` and `instrumentation.ts` are excluded from the static
  build; `next.config.ts` defines `headers()` only for the web build.
* The session cookie must be `SameSite=None; Secure` (see ADR-0004).
* **Installed APKs carry an old UI for a long time.** The API must stay
  backward compatible: new request fields/headers are optional, new response
  fields are additive, `error` stays a string, list endpoints bound their size
  by default. Breaking changes require a forced app update (`[force-update]` in
  the release tag message) and a deprecation window.
* Native code (`android/`) is hardened separately: no cloud backup, no
  cleartext traffic, updater restricted to HTTPS GitHub release assets with a
  mandatory SHA-256.

## Alternatives
Separate React Native app (cost), PWA only (no installer/print/file plugins we
rely on).
