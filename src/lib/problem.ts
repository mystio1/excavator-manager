/**
 * The error response body shared by every API error — Route Handlers
 * (src/lib/api-error.ts) and the proxy (src/proxy.ts, which cannot import
 * request-context). Pure: no framework or request-scoped imports.
 *
 * Our fields (`error` is a STRING — installed Android apps read it as text —
 * plus `code`, `requestId`, `details`) are combined with the RFC 9457
 * "problem details" members (`type`, `title`, `status`, `detail`, `instance`).
 * See docs/adr/0003-error-contract.md.
 */
export function problemBody(p: {
  code: string;
  title: string;
  message: string;
  status: number;
  requestId?: string | null;
  details?: unknown;
}) {
  return {
    error: p.message,
    code: p.code,
    ...(p.requestId ? { requestId: p.requestId } : {}),
    ...(p.details !== undefined ? { details: p.details } : {}),
    type: `urn:excavator:problem:${p.code.toLowerCase().replace(/_/g, "-")}`,
    title: p.title,
    status: p.status,
    detail: p.message,
    ...(p.requestId ? { instance: `urn:request:${p.requestId}` } : {}),
  };
}
