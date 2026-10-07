import { NextResponse } from "next/server";
import { appVersionSchema, isTrustedReleaseAssetUrl } from "@/lib/validation/app-version";
import { withApi } from "@/lib/with-api";

// Public, read-only (GET) and deliberately unauthenticated: the Android app
// polls it BEFORE login to learn whether an update exists. Its response bodies
// (including the short snake_case `error` strings) are unchanged — installed
// apps read them as they are.
//
// GitHub's REST API is fine to hit fresh on every request (no framework
// caching) — Next.js's own `fetch` cache + short-lived CDN caching upstream
// keeps this comfortably under GitHub's unauthenticated 60/hr rate limit if
// GITHUB_API_TOKEN isn't set; with it, the limit is 5,000/hr per token.
//
// Outbound hardening (these are the ONLY outbound requests whose target comes from
// remote data): every fetch has a timeout, every body a size cap, and the asset URL
// must be an https github.com release download of the configured repository. Redirects
// are followed because github.com serves release downloads from GitHub's own CDN; the
// starting host is pinned, so private-address/DNS-rebinding tricks do not apply.
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RELEASE_BYTES = 1024 * 1024; // the release payload lists assets and notes
const MAX_VERSION_ASSET_BYTES = 64 * 1024; // version.json is a few hundred bytes

class TooLargeError extends Error {}

/** Reads a JSON body but refuses to buffer more than `maxBytes` (declared or actual). */
async function readJsonLimited(res: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new TooLargeError();
  if (!res.body) return JSON.parse(await res.text());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new TooLargeError();
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export const GET = withApi("app-version.get", async () => {
  const repo = process.env.GITHUB_RELEASE_REPO;
  if (!repo) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_API_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_API_TOKEN}` }),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 120 },
    });
    if (!releaseRes.ok) {
      return NextResponse.json({ error: "release_check_failed" }, { status: 502 });
    }

    const release = (await readJsonLimited(releaseRes, MAX_RELEASE_BYTES)) as {
      assets?: { name: string; browser_download_url: string }[];
    };
    const asset = release.assets?.find((a) => a.name === "version.json");
    if (!asset) {
      return NextResponse.json({ error: "version_asset_missing" }, { status: 502 });
    }
    if (!isTrustedReleaseAssetUrl(asset.browser_download_url, repo)) {
      return NextResponse.json({ error: "version_asset_invalid" }, { status: 502 });
    }

    const assetRes = await fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 120 },
    });
    if (!assetRes.ok) {
      return NextResponse.json({ error: "version_asset_unavailable" }, { status: 502 });
    }

    const parsed = appVersionSchema.safeParse(await readJsonLimited(assetRes, MAX_VERSION_ASSET_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ error: "version_asset_invalid" }, { status: 502 });
    }

    return NextResponse.json(parsed.data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
    });
  } catch (error) {
    // A timeout, an oversized body, malformed JSON or a network failure.
    const error502 = error instanceof TooLargeError ? "version_asset_invalid" : "release_check_failed";
    return NextResponse.json({ error: error502 }, { status: 502 });
  }
});
