import { z } from "zod";

/**
 * Shape of `version.json`, published as a GitHub Release asset by
 * .github/workflows/release-android.yml and re-served (with validation) by
 * GET /api/app-version. `versionCode` is the authoritative comparison value
 * — it's the Android build's actual PackageInfo.versionCode, always a
 * strictly increasing integer (see the workflow's `GITHUB_RUN_NUMBER` note),
 * unlike versionName which is just a human-readable label.
 */
export const appVersionSchema = z.object({
  versionCode: z.number().int().positive(),
  versionName: z.string().min(1),
  // Must be an HTTPS GitHub release asset — the Android updater (see
  // UpdateInstallerPlugin.java) refuses any other host, and so does this.
  apkUrl: z
    .string()
    .url()
    .refine((value) => {
      try {
        const u = new URL(value);
        return u.protocol === "https:" && ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"].includes(u.hostname);
      } catch {
        return false;
      }
    }, "apkUrl must be an https://github.com release asset URL"),
  apkSha256: z.string().regex(/^[0-9a-f]{64}$/i, "Must be a 64-character hex SHA-256 hash"),
  forceUpdate: z.boolean(),
  releaseNotes: z.array(z.string()),
});

export type AppVersion = z.infer<typeof appVersionSchema>;

/** The only outbound request whose URL comes from remote data is the `version.json`
 * asset link in GitHub's release payload. Refuse anything that is not an https
 * github.com download of THIS repository, so a poisoned or unexpected payload can
 * never steer the server into fetching an arbitrary host (SSRF). */
export function isTrustedReleaseAssetUrl(value: unknown, repo: string): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "github.com" &&
      u.port === "" &&
      u.username === "" &&
      u.password === "" &&
      u.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/releases/download/`)
    );
  } catch {
    return false;
  }
}
