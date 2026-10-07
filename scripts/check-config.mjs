#!/usr/bin/env node
/**
 * Pre-deploy configuration gate. Runs the SAME validation the app runs at startup and in
 * /api/health/ready (src/lib/config-check.ts), but as a command that EXITS NON-ZERO, so a bad
 * configuration can fail the deploy instead of only logging an error and turning the readiness
 * probe red after the new version is already serving.
 *
 *   npm run check:config                  # validates the current environment (dev rules)
 *   npm run check:config -- --production  # production rules (https APP_URL, JOIN_CODE_SECRET advice...)
 *
 * Render: make the pre-deploy command   npx prisma migrate deploy && npm run check:config -- --production
 * (a failing pre-deploy keeps the previous release serving). Warnings print but do not fail unless
 * --strict is passed. Prints only variable NAMES and the nature of the problem — never a value.
 *
 * Needs Node >= 22.6 (it imports the TypeScript module directly with type stripping).
 */
import "dotenv/config";

const args = process.argv.slice(2);
const production = args.includes("--production") || process.env.NODE_ENV === "production";
const strict = args.includes("--strict");

const { checkConfig } = await import("../src/lib/config-check.ts");
const { errors, warnings } = checkConfig(process.env, production);

for (const e of errors) console.error(`ERROR    ${e}`);
for (const w of warnings) console.warn(`warning  ${w}`);
if (errors.length === 0 && warnings.length === 0) console.log("configuration looks complete");

const failed = errors.length > 0 || (strict && warnings.length > 0);
console.log(`\n${production ? "production" : "development"} rules: ${errors.length} error(s), ${warnings.length} warning(s)${failed ? " — FAILED" : ""}`);
process.exit(failed ? 1 : 0);
