import { NextResponse } from "next/server";
import { appVersionSchema } from "@/lib/validation/app-version";

// GitHub's REST API is fine to hit fresh on every request (no framework
// caching) — Next.js's own `fetch` cache + short-lived CDN caching upstream
// keeps this comfortably under GitHub's unauthenticated 60/hr rate limit if
// GITHUB_API_TOKEN isn't set; with it, the limit is 5,000/hr per token.
export async function GET() {
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
      next: { revalidate: 120 },
    });
    if (!releaseRes.ok) {
      return NextResponse.json({ error: "release_check_failed" }, { status: 502 });
    }

    const release = await releaseRes.json();
    const asset = (release.assets as { name: string; browser_download_url: string }[] | undefined)?.find(
      (a) => a.name === "version.json",
    );
    if (!asset) {
      return NextResponse.json({ error: "version_asset_missing" }, { status: 502 });
    }

    const assetRes = await fetch(asset.browser_download_url, { next: { revalidate: 120 } });
    if (!assetRes.ok) {
      return NextResponse.json({ error: "version_asset_unavailable" }, { status: 502 });
    }

    const parsed = appVersionSchema.safeParse(await assetRes.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "version_asset_invalid" }, { status: 502 });
    }

    return NextResponse.json(parsed.data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
    });
  } catch {
    return NextResponse.json({ error: "release_check_failed" }, { status: 502 });
  }
}
