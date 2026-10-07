#!/usr/bin/env node
/**
 * Graceful-shutdown drill: does a deploy (Render sends SIGTERM) let an in-flight request finish?
 *
 *   npm run build && node scripts/shutdown-drill.mjs
 *
 * It starts `next start`, opens a request whose body is still being sent, sends SIGTERM to the server,
 * and checks that (1) the server did NOT die while the request was in flight, (2) the request still got
 * its response once the body arrived, (3) new connections are refused after the signal, and (4) the
 * process then exited with the SIGTERM code (143) within the time Render allows.
 *
 * Needs POSIX signals: run it on Linux, macOS or WSL. Windows cannot deliver SIGTERM to a Node process
 * (the signal is a forced kill there), so the drill reports SKIPPED. next/dist/server/lib/start-server.js
 * (Next 16.3.8) registers the SIGTERM handler that calls server.close() and waits for pending requests;
 * this script is the executable proof of that, to be re-run after a Next upgrade. It writes nothing and
 * only issues one POST that is rejected by validation.
 */
import { spawn } from "node:child_process";
import net from "node:net";

if (process.platform === "win32") {
  console.log("SKIPPED: this drill needs POSIX signals (Linux, macOS or WSL). Windows turns SIGTERM into a forced kill.");
  process.exit(0);
}

const PORT = Number(process.env.DRILL_PORT ?? 3199);
const GRACE_MS = Number(process.env.DRILL_GRACE_MS ?? 10_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "ignore", "inherit"],
});
let exitInfo = null;
server.on("exit", (code, signal) => (exitInfo = { code, signal, at: Date.now() }));

async function waitUntilUp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  return false;
}

try {
  check("the production server started", await waitUntilUp());

  // An in-flight request: headers and the first bytes of the body are sent, the rest is held back.
  const body = JSON.stringify({ password: "x" });
  const socket = net.connect(PORT, "127.0.0.1");
  let received = "";
  socket.on("data", (d) => (received += d.toString("utf8")));
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(
    [
      "POST /api/support/login HTTP/1.1",
      `Host: 127.0.0.1:${PORT}`,
      `Origin: http://127.0.0.1:${PORT}`,
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Connection: close",
      "",
      body.slice(0, 5),
    ].join("\r\n"),
  );
  await sleep(500);

  const sentAt = Date.now();
  server.kill("SIGTERM");
  await sleep(1500);
  check("the server is still alive 1.5 s after SIGTERM while a request is in flight", exitInfo === null, exitInfo ? `exited ${JSON.stringify(exitInfo)}` : "");

  let refused = false;
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(2000) });
  } catch {
    refused = true;
  }
  check("new connections are refused once shutdown has begun", refused);

  // Finish the request: it must still get a real HTTP response.
  socket.write(body.slice(5));
  const deadline = Date.now() + 5000;
  while (!/^HTTP\/1\.1 \d{3}/.test(received) && Date.now() < deadline) await sleep(100);
  check("the in-flight request still received a response", /^HTTP\/1\.1 \d{3}/.test(received), received.split("\r\n")[0] || "no response");
  socket.destroy();

  const exitDeadline = sentAt + GRACE_MS;
  while (exitInfo === null && Date.now() < exitDeadline) await sleep(100);
  check("the process exited within the grace period", exitInfo !== null, `${GRACE_MS} ms allowed`);
  check("it exited with the SIGTERM code (143)", exitInfo?.code === 143 || exitInfo?.signal === "SIGTERM", JSON.stringify(exitInfo));
} finally {
  if (exitInfo === null) server.kill("SIGKILL");
  console.log(`\n${failures === 0 ? "graceful shutdown drill passed" : failures + " check(s) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}
