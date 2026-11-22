// Starts Vitest from a working directory spelled with an upper-case drive letter.
//
// Windows: a terminal opened as "c:\..." (VS Code does this) and Vitest's own "C:/..." paths name the
// same file two ways, and Vitest 5 then runs each test file against a second copy of itself —
// every suite fails with "Cannot read properties of undefined (reading 'config')". The config file
// cannot fix it (the workers start before it loads), so `npm test` starts Vitest from the one
// spelling instead. Elsewhere this is a plain pass-through.
import { spawn } from "node:child_process";
import path from "node:path";

const cwd = process.platform === "win32" ? process.cwd().replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`) : process.cwd();
const bin = path.join(cwd, "node_modules", "vitest", "vitest.mjs");
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
