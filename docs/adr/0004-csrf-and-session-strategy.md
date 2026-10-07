# ADR-0004: CSRF strategy and session model

Status: accepted

## Context
The production session cookie is `SameSite=None; Secure` because the Android
app's bundled UI (origin `https://localhost`) calls the API cross-origin and
needs the cookie. That makes the cookie available to requests started by *any*
website. Route handlers read the body with `req.json()` regardless of
Content-Type, so a cross-site `<form enctype="text/plain">` POST would have
worked. CORS does not prevent that — it only restricts reading responses.

## Decision
* **Origin-based CSRF check** for every POST/PUT/PATCH/DELETE under `/api`
  (`src/lib/csrf.ts`, applied in `src/proxy.ts`): trusted Origin (APP_URL,
  ALLOWED_ORIGINS, the Capacitor origin, or same host) → allow; otherwise when
  Origin is absent require `Sec-Fetch-Site: same-origin|none`; a cookie-bearing
  request with neither header is rejected. Result: `403 CSRF_VALIDATION_FAILED`.
  No per-form token is needed, so the Android app and old installs keep working.
* **Sessions stay JWT (NextAuth)** — switching to server-side sessions would break
  the architecture for a gain we can get more cheaply: a `tokenVersion` claim
  checked against `User.tokenVersion` / `Operator.tokenVersion` on every request
  (one query that already loads the business) so password reset/change, PIN
  change and account removal revoke all sessions immediately.
* **Support console** uses its own DB-backed opaque sessions (hash stored,
  1-hour expiry, revocable) instead of an HMAC token signed with `AUTH_SECRET`.
* **Rate limiting** is database-backed (shared across instances, survives
  restarts), keyed per client IP *and* per account.

## Consequences
Cross-site mutations are rejected; same-origin web and Android keep working.
A request from a non-browser client with no cookie and no Origin is allowed
(nothing to forge). Because the check depends on the browser sending
Origin/Sec-Fetch-Site, very old browsers that send neither are handled by the
cookie rule above.

## Trade-offs and alternatives considered (added after review)

**The cost of `SameSite=None`.** Every website can make the browser attach the session cookie
to a request to this API; we are relying on the server-side Origin / Fetch-Metadata check
(plus HttpOnly, Secure, and JSON-only handlers) to refuse those requests, instead of on the
browser's own `SameSite=Lax` protection. A bug in `checkCsrf()` therefore matters more than it
would on a Lax cookie. The check is covered by unit tests and one real-browser run of a
hostile cross-origin form against the production build (refused, 403). The browser run only
exercised the *fixed* behaviour. The exposure itself is shown without disabling anything in
`tests/security/csrf-exposure.test.ts`: the real mutating handler, called on its own with a cross-site
`text/plain` body and a session-cookie header, accepts it and writes a row, while the same request sent
through the edge proxy is refused with 403 and writes nothing — so the proxy check is what protects the
API. What is still not shown is the exposure in a real browser (that a browser attaches the
`SameSite=None` cookie to a cross-site form post is read from the cookie configuration, not observed).

**Why not a CSRF token as well?** Defence in depth would add a synchroniser/double-submit token.
It is not done because installed Android apps do not send one and cannot be changed in place;
adding it would break them until a forced update. It becomes reasonable once old apps are
retired (see ADR-0005) — the Origin check would stay as the first layer.

**Alternatives for the Android session**, in the order worth considering:

1. *Keep as is* (chosen): one cookie, one auth path, the app and the web share all code.
2. *Bearer token for the app only* (stored in Android Keystore-backed storage, sent in an
   `Authorization` header): the cookie could become `SameSite=Lax` for the web, removing the
   cross-site exposure entirely. Costs: a second auth path, token storage/rotation, refresh,
   and rewriting every `apiFetch` call site for the Android build.
3. *Serve the Android WebView from the app's own origin via a thin proxy*: avoids cross-origin
   cookies but needs a hosted component and defeats the "static export in the APK" design.

**DECISION (owner):** stay with option 1 while the app has a single operator-owner and the CSRF
check stays tested; revisit option 2 when old apps are retired or the user base grows.

**Session lifetime and revocation.** The JWT lives at most 30 days; revocation does not wait
for expiry because every request compares the token's `tokenVersion` with the database. Owners
can end all sessions from Settings ("Sign out of all devices") without changing the password.
There is no device list and no per-device revocation.
