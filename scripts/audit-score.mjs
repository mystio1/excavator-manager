#!/usr/bin/env node
/**
 * Reproducible audit score over the 97 points of the "audit the auditor" critique.
 *
 *   node scripts/audit-score.mjs <status.json> [--exclude-owner]
 *
 * <status.json> = {"<point number>": "<STATUS>", ...} from the read-only re-check of the final repository, where
 * STATUS is PASS | UNVERIFIED | PARTIAL | OWNER | ACCEPTED | NOT_APPLICABLE | OPEN.
 *
 * Score = sum(weight x credit) / sum(weight over APPLICABLE points) x 100
 *
 * Weight (importance), by the critique's own grouping:
 *   3  points 3-21 and 58   tenant isolation, authorization, CSRF, sessions, money, audit trail, support console, concurrency
 *   2  everything else between 22 and 78, and 85-89   hardening, delivery, operations, privacy, supply chain, secrets
 *   1  points 1-2, 59-68, 79-84, 90-97   testing breadth, design, reporting and process
 * Credit (evidence quality):
 *   PASS            1.00  built and an automated test would fail on regression
 *   UNVERIFIED      0.75  built or written, no automated gate (or the proof lives outside the repository)
 *   OWNER (repo side complete)  0.50  everything the repo can do is done; a setting/decision remains with the owner
 *   OWNER (nothing built)       0.25  only the owner can act and no repo-side work exists
 *   PARTIAL         0.40  some of the point is done, something material is missing
 *   OPEN            0.00
 *   ACCEPTED / NOT_APPLICABLE   excluded from the denominator (neutral, never a penalty)
 */
import fs from "node:fs";

const status = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const excludeOwner = process.argv.includes("--exclude-owner");

// OWNER points whose repository-side work is complete (credited 0.5); the rest of OWNER points are credited 0.25
const OWNER_REPO_DONE = new Set([38, 43, 47, 50, 73, 75, 76, 77, 87]);

const weight = (n) => {
  if ((n >= 3 && n <= 21) || n === 58) return 3;
  if (n === 1 || n === 2 || (n >= 59 && n <= 68) || (n >= 79 && n <= 84) || n >= 90) return 1;
  return 2;
};
const credit = (n, s) => {
  if (s === "PASS") return 1;
  if (s === "UNVERIFIED") return 0.75;
  if (s === "PARTIAL") return 0.4;
  if (s === "OPEN") return 0;
  if (s === "OWNER") return OWNER_REPO_DONE.has(n) ? 0.5 : 0.25;
  return null; // ACCEPTED, NOT_APPLICABLE
};

let num = 0;
let den = 0;
const counts = {};
for (let n = 1; n <= 97; n++) {
  const s = status[String(n)];
  if (!s) throw new Error(`missing status for point ${n}`);
  counts[s] = (counts[s] || 0) + 1;
  const c = credit(n, s);
  if (c === null || (excludeOwner && s === "OWNER")) continue;
  num += weight(n) * c;
  den += weight(n);
}
console.log(counts);
console.log(`weighted credit ${num.toFixed(2)} / weighted applicable ${den}`);
console.log(`SCORE: ${((100 * num) / den).toFixed(1)} / 100${excludeOwner ? " (OWNER points excluded)" : ""}`);
