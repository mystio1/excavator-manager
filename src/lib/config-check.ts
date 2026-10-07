/**
 * Configuration validation, shared by the startup log (src/instrumentation.ts) and
 * the readiness probe (/api/health/ready). Pure: takes the environment as an
 * argument so it is unit-tested without touching process.env.
 *
 * `errors` mean the instance cannot serve safely (readiness reports 503); `warnings`
 * are risky-but-working settings, logged once at startup. Only variable NAMES and
 * the nature of the problem are returned — never a value.
 */

export type ConfigReport = { errors: string[]; warnings: string[] };

type Env = Record<string, string | undefined>;

const PLACEHOLDERS = new Set(["replace-me", "changeme", "change-me", "secret", "password"]);

function isUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function checkConfig(env: Env, production: boolean): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const db = env.DATABASE_URL;
  if (!db) errors.push("DATABASE_URL is not set");
  else if (!isUrl(db, ["postgres:", "postgresql:"])) errors.push("DATABASE_URL is not a postgres:// URL");

  const auth = env.AUTH_SECRET;
  if (!auth) errors.push("AUTH_SECRET is not set");
  else if (PLACEHOLDERS.has(auth.toLowerCase()) || auth.length < 16) {
    errors.push("AUTH_SECRET is a placeholder or too short (generate 32 random bytes)");
  } else if (auth.length < 32) {
    warnings.push("AUTH_SECRET is shorter than 32 characters");
  }

  if (env.AUTH_SECRET_PREVIOUS) {
    if (env.AUTH_SECRET_PREVIOUS === auth) {
      warnings.push("AUTH_SECRET_PREVIOUS equals AUTH_SECRET, so there is nothing to roll over; remove it");
    } else if (env.AUTH_SECRET_PREVIOUS.length < 16) {
      warnings.push("AUTH_SECRET_PREVIOUS is a placeholder or too short to be a real previous secret");
    }
  }

  if (production) {
    if (!env.APP_URL) errors.push("APP_URL is not set (required in production)");
    else if (!isUrl(env.APP_URL, ["https:"])) errors.push("APP_URL must be an https:// URL in production");

    if (!env.JOIN_CODE_SECRET) {
      warnings.push("JOIN_CODE_SECRET is not set: operator join codes are keyed with AUTH_SECRET");
    } else if (env.JOIN_CODE_SECRET === auth) {
      warnings.push("JOIN_CODE_SECRET equals AUTH_SECRET, so the keys are not separated");
    }
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
      warnings.push("RESEND_API_KEY and/or RESEND_FROM_EMAIL is not set: password-reset emails cannot be sent");
    }
  }

  const support = env.SUPPORT_ACCESS_PASSWORD;
  if (support && production && support.length < 12) {
    warnings.push("SUPPORT_ACCESS_PASSWORD is shorter than 12 characters");
  }

  // These silently fall back to a default when invalid, which hides a mistake.
  const hops = env.TRUSTED_PROXY_HOPS;
  if (hops !== undefined && hops !== "") {
    const n = Number(hops);
    if (!Number.isInteger(n) || n < 0 || n > 5) warnings.push("TRUSTED_PROXY_HOPS must be an integer 0-5 (using 1)");
  }
  const pool = env.DB_POOL_MAX;
  if (pool !== undefined && pool !== "" && !(Number.isInteger(Number(pool)) && Number(pool) >= 1)) {
    warnings.push("DB_POOL_MAX must be a positive integer (using the default)");
  }
  const repo = env.GITHUB_RELEASE_REPO;
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) warnings.push("GITHUB_RELEASE_REPO must look like owner/name");
  for (const origin of (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)) {
    if (!isUrl(origin, ["https:", "http:"])) {
      warnings.push("ALLOWED_ORIGINS contains an entry that is not a valid origin");
      break;
    }
  }

  return { errors, warnings };
}
