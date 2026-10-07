import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request context so the logger, audit trail and error responses can all
 * carry the same request id without threading it through every function. */
export type RequestContext = {
  requestId: string;
  route?: string;
  operation?: string;
  businessId?: string;
  userId?: string;
  /** Set while a support person is acting inside an owner's session (impersonation). */
  supportSessionId?: string;
  /** The owner account being impersonated. */
  onBehalfOfUserId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Called by the auth guards once the caller is known. Mutates the active
 * context (a no-op outside a request). */
export function setContextActor(actor: {
  businessId?: string;
  userId?: string;
  supportSessionId?: string;
  onBehalfOfUserId?: string;
}) {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (actor.businessId) ctx.businessId = actor.businessId;
  if (actor.userId) ctx.userId = actor.userId;
  if (actor.supportSessionId) ctx.supportSessionId = actor.supportSessionId;
  if (actor.onBehalfOfUserId) ctx.onBehalfOfUserId = actor.onBehalfOfUserId;
}
