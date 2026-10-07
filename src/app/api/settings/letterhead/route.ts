import { requireBusinessApi } from "@/lib/api-auth";
import { getLetterheadImages, updateBillLetterhead } from "@/lib/services/settings";
import { buildBillLetterheadSchema } from "@/lib/validation/settings";
import { json, parseBody, withApi } from "@/lib/with-api";

// Installed apps resend all three images on every save, and the old upload
// limit was 400 KB per file, so a stored image can legitimately be a little
// larger than a NEW upload may be. The body bound allows for three of those
// (plus the short text fields); a changed image is still held to 300 KB below.
const LEGACY_IMAGE_DATA_URL_LENGTH = 64 + Math.ceil((400 * 1024 * 4) / 3);
const MAX_BODY_BYTES = 3 * LEGACY_IMAGE_DATA_URL_LENGTH + 4 * 1024;

/** Updates the bill letterhead. Images are validated server-side (PNG/JPEG/WebP
 * only, <= 300 KB, <= 2000 px, magic bytes checked — see validation/settings.ts);
 * an image field that is omitted keeps the stored one, "" removes it, and an
 * image identical to the stored one is accepted as unchanged. */
export const PATCH = withApi("settings.letterhead.update", async (req) => {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const input = await parseBody(req, buildBillLetterheadSchema(await getLetterheadImages(businessId)), {
    maxBytes: MAX_BODY_BYTES,
    tooLargeMessage: "The images are too large — each image may be at most 300 KB",
  });
  await updateBillLetterhead(businessId, auth.actor, input);
  return json({ ok: true });
});
