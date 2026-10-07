#!/usr/bin/env node
/**
 * License inventory of the PRODUCTION dependency tree (what ships in the server
 * and the Android bundle), read from package-lock.json + each installed package.json.
 *
 *   npm run licenses            # summary + anything needing review; exit 1 on a disallowed license
 *   npm run licenses -- --all   # also list every package
 *
 * Strong copyleft (GPL / AGPL / SSPL / EUPL) in a shipped dependency would impose
 * obligations on the app, so those FAIL. Weak copyleft (MPL, LGPL, EPL, CDDL) and
 * anything unrecognised is reported for a human decision but does not fail. Run
 * `npm ci` first. This is a dependency-license inventory, not legal advice.
 */
import fs from "node:fs";
import path from "node:path";
import { classify } from "./lib/license-classify.mjs";

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(" OR ");
  return "";
}

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const rows = [];
for (const [location, info] of Object.entries(lock.packages ?? {})) {
  if (!location || info.dev || info.devOptional) continue; // only what ships
  const manifest = path.join(location, "package.json");
  if (!fs.existsSync(manifest)) continue; // optional platform package not installed here
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const license = licenseOf(pkg) || info.license || "";
  rows.push({ name: pkg.name ?? location, version: pkg.version, license, verdict: classify(license) });
}

const counts = new Map();
for (const r of rows) counts.set(r.license || "(none declared)", (counts.get(r.license || "(none declared)") ?? 0) + 1);

console.log(`${rows.length} production packages\n`);
for (const [license, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(5)}  ${license}`);

const strong = rows.filter((r) => r.verdict === "strong");
const review = rows.filter((r) => r.verdict === "weak" || r.verdict === "unknown");
if (process.argv.includes("--all")) {
  console.log("\nAll packages:");
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) console.log(`  ${r.name}@${r.version}  ${r.license || "(none declared)"}  [${r.verdict}]`);
}
if (review.length) {
  console.log("\nNeeds a human look (weak copyleft or not recognised):");
  for (const r of review) console.log(`  ${r.name}@${r.version}  ${r.license || "(none declared)"}  [${r.verdict}]`);
}
if (strong.length) {
  console.error("\nDISALLOWED strong-copyleft licenses in production dependencies:");
  for (const r of strong) console.error(`  ${r.name}@${r.version}  ${r.license}`);
  process.exit(1);
}
console.log("\nNo strong-copyleft licenses in production dependencies.");
