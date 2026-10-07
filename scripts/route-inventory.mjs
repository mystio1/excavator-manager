#!/usr/bin/env node
// Writes docs/authorization-matrix.md. With --check, exits non-zero when a route has no
// authentication guard (and is not justified public) or when the committed file is stale.
import fs from "node:fs";
import { buildInventory, findViolations, renderMarkdown } from "./lib/route-inventory.mjs";

const OUT = "docs/authorization-matrix.md";
const rows = buildInventory(".");
const problems = findViolations(rows);
const markdown = renderMarkdown(rows);

if (process.argv.includes("--check")) {
  let failed = false;
  if (problems.length) {
    console.error("Authorization coverage problems:\n - " + problems.join("\n - "));
    failed = true;
  }
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== markdown.replace(/\r\n/g, "\n")) {
    console.error(`${OUT} is stale — run: node scripts/route-inventory.mjs`);
    failed = true;
  }
  process.exit(failed ? 1 : 0);
}

fs.writeFileSync(OUT, markdown);
console.log(`${OUT}: ${rows.length} route/method pairs; ${problems.length} problem(s)`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
