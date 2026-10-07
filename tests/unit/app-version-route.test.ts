import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/app-version/route";

/**
 * The route's outbound requests are the only ones whose target comes from remote data. These
 * tests drive the real handler with a mocked `fetch`, so deleting the host check, the timeout or the
 * size cap makes a test fail (the validator itself is covered in app-version-url.test.ts).
 */
const REPO = "mystio1/excavator-manager";
const GOOD_URL = `https://github.com/${REPO}/releases/download/v9/version.json`;
const VERSION = {
  versionCode: 9,
  versionName: "9.0.0",
  apkUrl: `https://github.com/${REPO}/releases/download/v9/app-release.apk`,
  apkSha256: "a".repeat(64),
  forceUpdate: false,
  releaseNotes: ["notes"],
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
const get = () => route.GET(new Request("http://x.test/api/app-version"), undefined);

let fetchMock: ReturnType<typeof vi.fn>;
let savedRepo: string | undefined;

beforeEach(() => {
  savedRepo = process.env.GITHUB_RELEASE_REPO;
  process.env.GITHUB_RELEASE_REPO = REPO;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedRepo === undefined) delete process.env.GITHUB_RELEASE_REPO;
  else process.env.GITHUB_RELEASE_REPO = savedRepo;
});

describe("GET /api/app-version outbound requests", () => {
  it("serves the validated version.json for a genuine release", async () => {
    fetchMock.mockResolvedValueOnce(json({ assets: [{ name: "version.json", browser_download_url: GOOD_URL }] }));
    fetchMock.mockResolvedValueOnce(json(VERSION));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(VERSION);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(GOOD_URL);
  });

  it.each([
    ["an internal address (SSRF)", "http://169.254.169.254/latest/meta-data/"],
    ["another host", `https://evil.example/${REPO}/releases/download/v9/version.json`],
    ["another repository on github.com", "https://github.com/someone/else/releases/download/v9/version.json"],
    ["plain http", `http://github.com/${REPO}/releases/download/v9/version.json`],
  ])("never fetches a poisoned asset URL (%s): 502 and no second request", async (_n, url) => {
    fetchMock.mockResolvedValueOnce(json({ assets: [{ name: "version.json", browser_download_url: url }] }));
    const res = await get();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "version_asset_invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the GitHub API call was made
  });

  it("gives every outbound request a timeout signal", async () => {
    fetchMock.mockResolvedValueOnce(json({ assets: [{ name: "version.json", browser_download_url: GOOD_URL }] }));
    fetchMock.mockResolvedValueOnce(json(VERSION));
    await get();
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("answers release_check_failed when GitHub is unreachable or times out", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out", "TimeoutError"));
    const res = await get();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "release_check_failed" });
  });

  it("refuses an oversized release payload or version.json instead of buffering it", async () => {
    fetchMock.mockResolvedValueOnce(json({}, { headers: { "content-length": String(5 * 1024 * 1024) } }));
    const big = await get();
    expect(big.status).toBe(502);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json({ assets: [{ name: "version.json", browser_download_url: GOOD_URL }] }));
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(200 * 1024), { status: 200 })); // no content-length: streamed count
    const streamed = await get();
    expect(streamed.status).toBe(502);
  });

  it("rejects a version.json that does not match the schema", async () => {
    fetchMock.mockResolvedValueOnce(json({ assets: [{ name: "version.json", browser_download_url: GOOD_URL }] }));
    fetchMock.mockResolvedValueOnce(json({ ...VERSION, apkUrl: "https://evil.example/app.apk" }));
    const res = await get();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "version_asset_invalid" });
  });
});
