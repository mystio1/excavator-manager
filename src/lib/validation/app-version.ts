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
  apkUrl: z.string().url(),
  apkSha256: z.string().regex(/^[0-9a-f]{64}$/i, "Must be a 64-character hex SHA-256 hash"),
  forceUpdate: z.boolean(),
  releaseNotes: z.array(z.string()),
});

export type AppVersion = z.infer<typeof appVersionSchema>;
