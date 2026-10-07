/** Builds the Request / context a Next.js route handler receives. */
export function req(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): Request {
  const hasBody = opts.body !== undefined || opts.rawBody !== undefined;
  return new Request(`https://app.example.test${path}`, {
    method,
    headers: { ...(hasBody ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) },
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
}

/** Dynamic-route context: Next.js 16 passes `params` as a Promise. */
export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

export type ErrorBody = { error: string; code: string; requestId?: string; details?: unknown };

/** Parsed JSON body of a Response, typed by the shape the test expects. */
export async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
