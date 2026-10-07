import { z } from "zod";

export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(200, "Business name is too long"),
  ownerName: z.string().trim().min(1, "Enter the owner's name").max(200, "Owner name is too long"),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30, "Phone number is too long"),
  address: z.string().trim().max(500, "Address is too long").optional(),
  gstNumber: z.string().trim().max(30, "GST number is too long").optional(),
  defaultServiceIntervalHrs: z.coerce.number().min(1, "Must be greater than 0"),
  maintenanceAlertThresholdHrs: z.coerce.number().min(1, "Must be greater than 0"),
});

// ---------------------------------------------------------------------------
// Letterhead images (logos + signature)
//
// These are stored inline as data: URIs on the Business row and copied onto
// every generated bill, so each one is loaded, serialized and rendered on every
// bill view / PDF / export. They are therefore validated HARD on the server —
// the client-side downscaling in image-upload-field.tsx is only a convenience:
//
//   * only PNG / JPEG / WebP, declared as `data:image/<type>;base64,...`
//     (SVG is rejected: it can carry script and external references)
//   * the payload must be valid base64
//   * decoded size <= 300 KB per image
//   * the file's magic bytes must match the declared type (no `.exe` labelled
//     image/png)
//   * pixel dimensions are read from the header (PNG, JPEG, WebP) and capped at
//     2000 x 2000 so a tiny file cannot decompress into a huge bitmap
//
// The functions below are isomorphic (no Node Buffer) so the constants can be
// shared with the browser-side resizer.
// ---------------------------------------------------------------------------

export const LETTERHEAD_IMAGE_MAX_BYTES = 300 * 1024;
export const LETTERHEAD_IMAGE_MAX_DIMENSION = 2000;
/** Longest accepted `data:` URI: header + base64 of the largest allowed image. */
export const LETTERHEAD_IMAGE_MAX_DATA_URL_LENGTH = 64 + Math.ceil((LETTERHEAD_IMAGE_MAX_BYTES * 4) / 3) + 4;

export type LetterheadImageMime = "image/png" | "image/jpeg" | "image/webp";

export type LetterheadImageCheck =
  | { ok: true; mime: LetterheadImageMime; bytes: number; width: number; height: number }
  | { ok: false; message: string };

const ALLOWED_MIMES: readonly LetterheadImageMime[] = ["image/png", "image/jpeg", "image/webp"];
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const reject = (message: string): LetterheadImageCheck => ({ ok: false, message });

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const ascii = (b: Uint8Array, o: number, len: number) => String.fromCharCode(...b.subarray(o, o + len));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasMagic(mime: LetterheadImageMime, b: Uint8Array): boolean {
  switch (mime) {
    case "image/png":
      return b.length >= 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp":
      return b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";
  }
}

function pngSize(b: Uint8Array): { width: number; height: number } | null {
  // 8-byte signature, then the IHDR chunk: length(4)=13, "IHDR"(4), width(4), height(4), ...
  if (b.length < 24 || u32be(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let o = 2; // after the SOI marker
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    while (b[o] === 0xff && o < b.length) o++; // fill bytes
    const marker = b[o];
    o++;
    // Standalone markers carry no length: TEM, RSTn, SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // EOI, or the start of scan data, reached without ever seeing a frame header.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (o + 2 > b.length) return null;
    const segmentLength = u16be(b, o);
    if (segmentLength < 2) return null;
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      // length(2), precision(1), height(2), width(2)
      if (o + 7 > b.length) return null;
      return { width: u16be(b, o + 5), height: u16be(b, o + 3) };
    }
    o += segmentLength;
  }
  return null;
}

function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X") {
    // canvas width-1 / height-1 as 24-bit little-endian at 24 / 27
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  if (chunk === "VP8 ") {
    // 3-byte frame tag, start code 9D 01 2A, then 14-bit width / height (+ scale bits)
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // signature byte 0x2F, then 14-bit width-1 and 14-bit height-1, little-endian bit-packed
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  return null;
}

/** Checks one letterhead data URI. Returns the first problem as a user-facing message. */
export function inspectLetterheadImage(dataUrl: string): LetterheadImageCheck {
  if (dataUrl.length > LETTERHEAD_IMAGE_MAX_DATA_URL_LENGTH) {
    return reject(`Image is too large — the maximum is ${LETTERHEAD_IMAGE_MAX_BYTES / 1024} KB`);
  }

  const comma = dataUrl.indexOf(",");
  const header = comma === -1 ? dataUrl : dataUrl.slice(0, comma);
  if (comma === -1 || !/^data:image\/[a-z0-9.+-]+;base64$/i.test(header)) {
    return reject("Image must be a PNG, JPEG or WebP file");
  }
  const declared = header.slice("data:".length, -";base64".length).toLowerCase();
  if (declared === "image/svg+xml" || declared.startsWith("image/svg")) {
    return reject("SVG images are not allowed — please use a PNG, JPEG or WebP image");
  }
  const mime = ALLOWED_MIMES.find((m) => m === declared);
  if (!mime) return reject("Only PNG, JPEG or WebP images are allowed");

  const b64 = dataUrl.slice(comma + 1);
  if (b64.length === 0 || b64.length % 4 !== 0 || !BASE64_RE.test(b64)) {
    return reject("Image data is not valid base64");
  }
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const decodedBytes = (b64.length / 4) * 3 - padding;
  if (decodedBytes > LETTERHEAD_IMAGE_MAX_BYTES) {
    return reject(`Image is too large (${Math.ceil(decodedBytes / 1024)} KB) — the maximum is ${LETTERHEAD_IMAGE_MAX_BYTES / 1024} KB`);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(b64);
  } catch {
    return reject("Image data is not valid base64");
  }
  if (!hasMagic(mime, bytes)) {
    return reject(`The file content does not match its declared type (${mime}) — upload a real PNG, JPEG or WebP image`);
  }

  const size = mime === "image/png" ? pngSize(bytes) : mime === "image/jpeg" ? jpegSize(bytes) : webpSize(bytes);
  if (!size || size.width < 1 || size.height < 1) {
    return reject("Could not read the image size — the file may be corrupt");
  }
  if (size.width > LETTERHEAD_IMAGE_MAX_DIMENSION || size.height > LETTERHEAD_IMAGE_MAX_DIMENSION) {
    return reject(
      `Image is ${size.width} x ${size.height} px — the maximum is ${LETTERHEAD_IMAGE_MAX_DIMENSION} x ${LETTERHEAD_IMAGE_MAX_DIMENSION} px`,
    );
  }

  return { ok: true, mime, bytes: bytes.length, width: size.width, height: size.height };
}

/** "" clears the image; anything else must pass inspectLetterheadImage. The
 * field name is prefixed to the message so the owner knows which of the three
 * images to fix. `unchanged` is the image currently stored for the field: a
 * value identical to it is not re-checked — it is already saved (possibly under
 * the older, looser rules) and sending it back changes nothing. That keeps
 * installed apps, which resend all three images on every save, able to edit the
 * tagline or colour of a business whose stored logo predates the limits. */
const letterheadImage = (label: string, unchanged?: string | null) =>
  z
    .string()
    .superRefine((value, ctx) => {
      if (value === "" || (unchanged && value === unchanged)) return;
      const check = inspectLetterheadImage(value);
      if (!check.ok) ctx.addIssue({ code: "custom", message: `${label}: ${check.message}` });
    })
    .optional();

/** The images currently stored on the business (see letterheadImage). */
export type StoredLetterheadImages = {
  logoLeftUrl?: string | null;
  logoRightUrl?: string | null;
  signatureUrl?: string | null;
};

export function buildBillLetterheadSchema(stored: StoredLetterheadImages = {}) {
  return z.object({
    // Omitted = leave the stored image unchanged; "" = remove it.
    logoLeftUrl: letterheadImage("Left logo", stored.logoLeftUrl),
    logoRightUrl: letterheadImage("Right logo", stored.logoRightUrl),
    signatureUrl: letterheadImage("Signature", stored.signatureUrl),
    billTagline: z.string().trim().max(200, "Tagline is too long").optional(),
    billAccentColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Accent colour must look like #0B2B5E"),
  });
}

/** Strict form: every image present in the body is fully validated. */
export const billLetterheadSchema = buildBillLetterheadSchema();

export const operatorLanguageSchema = z.object({
  operatorLanguage: z.enum(["en", "hi", "mr"]),
});

/** Business-code regeneration: blank / missing = auto-generate. */
export const regenerateBusinessCodeSchema = z.object({
  customCode: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^[A-Za-z0-9]{3,20}$/.test(v), "Business code must be 3-20 letters/numbers, no spaces or symbols"),
});

export const bankAccountSchema = z.object({
  label: z.string().trim().min(1, "Give this account a short label").max(100, "Label is too long"),
  accountHolderName: z.string().trim().min(1, "Enter the account holder name").max(200, "Account holder name is too long"),
  accountNumber: z.string().trim().min(1, "Enter the account number").max(40, "Account number is too long"),
  ifsc: z.string().trim().min(1, "Enter the IFSC code").max(20, "IFSC code is too long"),
  bankName: z.string().trim().min(1, "Enter the bank name").max(200, "Bank name is too long"),
  branch: z.string().trim().max(200, "Branch is too long").optional(),
  isDefaultForGst: z.coerce.boolean().optional(),
  isDefaultForNonGst: z.coerce.boolean().optional(),
});
