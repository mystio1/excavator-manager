import { describe, expect, it } from "vitest";
import {
  LETTERHEAD_IMAGE_MAX_BYTES,
  LETTERHEAD_IMAGE_MAX_DIMENSION,
  billLetterheadSchema,
  buildBillLetterheadSchema,
  inspectLetterheadImage,
} from "@/lib/validation/settings";
import { makeJpeg, makePng, makeWebp, toDataUrl } from "./image-fixtures";

/**
 * Letterhead images are stored inline and copied onto every bill, so the server
 * is strict about what it accepts: PNG / JPEG / WebP only, valid base64, <= 300 KB
 * decoded, magic bytes matching the declared type, <= 2000 x 2000 px.
 */

const rejected = (value: string) => {
  const check = inspectLetterheadImage(value);
  if (check.ok) throw new Error("expected the image to be rejected");
  return check.message;
};

describe("inspectLetterheadImage - accepts normal images", () => {
  it("accepts a small PNG and reports its size", () => {
    const check = inspectLetterheadImage(toDataUrl("image/png", makePng(120, 60)));
    expect(check).toMatchObject({ ok: true, mime: "image/png", width: 120, height: 60 });
  });

  it("accepts a small JPEG and reports its size", () => {
    const check = inspectLetterheadImage(toDataUrl("image/jpeg", makeJpeg(300, 200)));
    expect(check).toMatchObject({ ok: true, mime: "image/jpeg", width: 300, height: 200 });
  });

  it.each(["VP8X", "VP8L", "VP8 "] as const)("accepts a small WebP (%s bitstream)", (kind) => {
    const check = inspectLetterheadImage(toDataUrl("image/webp", makeWebp(64, 48, kind)));
    expect(check).toMatchObject({ ok: true, mime: "image/webp", width: 64, height: 48 });
  });

  it("accepts the exact limits (2000 x 2000 px, 300 KB)", () => {
    const max = LETTERHEAD_IMAGE_MAX_DIMENSION;
    expect(inspectLetterheadImage(toDataUrl("image/png", makePng(max, max))).ok).toBe(true);
    expect(inspectLetterheadImage(toDataUrl("image/jpeg", makeJpeg(max, max))).ok).toBe(true);

    // Pad a PNG to exactly 300 KB (the padding chunk adds 12 bytes of framing).
    const base = makePng(10, 10).length;
    const exact = makePng(10, 10, LETTERHEAD_IMAGE_MAX_BYTES - base - 12);
    expect(exact.length).toBe(LETTERHEAD_IMAGE_MAX_BYTES);
    expect(inspectLetterheadImage(toDataUrl("image/png", exact)).ok).toBe(true);
  });

  it("accepts an uppercase MIME declaration", () => {
    expect(inspectLetterheadImage(toDataUrl("IMAGE/PNG", makePng())).ok).toBe(true);
  });
});

describe("inspectLetterheadImage - rejects bad images", () => {
  it("rejects SVG with a clear message (declared type)", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(rejected(toDataUrl("image/svg+xml", svg))).toMatch(/SVG images are not allowed/i);
  });

  it("rejects SVG hidden behind a PNG label (wrong magic bytes)", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(rejected(toDataUrl("image/png", svg))).toMatch(/does not match its declared type/i);
  });

  it("rejects other image types such as GIF and BMP", () => {
    expect(rejected(toDataUrl("image/gif", Buffer.from("GIF89a....")))).toMatch(/PNG, JPEG or WebP/);
    expect(rejected(toDataUrl("image/bmp", Buffer.from("BM......")))).toMatch(/PNG, JPEG or WebP/);
  });

  it("rejects non-image MIME types and non-data URLs", () => {
    expect(rejected(toDataUrl("text/html", Buffer.from("<script>alert(1)</script>")))).toMatch(/PNG, JPEG or WebP/);
    expect(rejected("https://example.com/logo.png")).toMatch(/PNG, JPEG or WebP/);
    expect(rejected("javascript:alert(1)")).toMatch(/PNG, JPEG or WebP/);
    // Not base64 encoded at all (percent-encoded payload).
    expect(rejected("data:image/png,%89PNG")).toMatch(/PNG, JPEG or WebP/);
  });

  it("rejects bytes that do not match the declared type (both directions)", () => {
    expect(rejected(toDataUrl("image/png", makeJpeg()))).toMatch(/does not match its declared type/i);
    expect(rejected(toDataUrl("image/jpeg", makePng()))).toMatch(/does not match its declared type/i);
    expect(rejected(toDataUrl("image/webp", makePng()))).toMatch(/does not match its declared type/i);
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // "MZ" DOS header
    expect(rejected(toDataUrl("image/png", exe))).toMatch(/does not match its declared type/i);
  });

  it("rejects an image over 300 KB, saying how big it is", () => {
    const big = makePng(10, 10, LETTERHEAD_IMAGE_MAX_BYTES + 1000);
    expect(big.length).toBeGreaterThan(LETTERHEAD_IMAGE_MAX_BYTES);
    expect(rejected(toDataUrl("image/png", big))).toMatch(/too large.*300 KB/i);
  });

  it("rejects one byte over the limit", () => {
    const base = makePng(10, 10).length;
    const oneOver = makePng(10, 10, LETTERHEAD_IMAGE_MAX_BYTES - base - 12 + 1);
    expect(oneOver.length).toBe(LETTERHEAD_IMAGE_MAX_BYTES + 1);
    expect(rejected(toDataUrl("image/png", oneOver))).toMatch(/too large/i);
  });

  it("rejects an absurdly long payload without decoding it", () => {
    const huge = `data:image/png;base64,${"A".repeat(5_000_000)}`;
    expect(rejected(huge)).toMatch(/too large/i);
  });

  it("rejects images wider or taller than 2000 px (PNG, JPEG, WebP)", () => {
    const over = LETTERHEAD_IMAGE_MAX_DIMENSION + 1;
    expect(rejected(toDataUrl("image/png", makePng(over, 100)))).toMatch(/2001 x 100 px.*2000 x 2000/);
    expect(rejected(toDataUrl("image/png", makePng(100, over)))).toMatch(/100 x 2001 px/);
    expect(rejected(toDataUrl("image/jpeg", makeJpeg(over, 100)))).toMatch(/2001 x 100 px/);
    expect(rejected(toDataUrl("image/jpeg", makeJpeg(100, over)))).toMatch(/100 x 2001 px/);
    expect(rejected(toDataUrl("image/webp", makeWebp(over, 100)))).toMatch(/2001 x 100 px/);
  });

  it("rejects a decompression-bomb style PNG (tiny file, huge declared size)", () => {
    const bomb = makePng(60_000, 60_000);
    expect(bomb.length).toBeLessThan(1024);
    expect(rejected(toDataUrl("image/png", bomb))).toMatch(/60000 x 60000 px/);
  });

  it("rejects non-base64 payloads", () => {
    expect(rejected("data:image/png;base64,!!!not base64!!!")).toMatch(/not valid base64/i);
    expect(rejected("data:image/png;base64,iVBORw0K=GgoAAAANSUhEUg")).toMatch(/not valid base64/i);
    // Wrong length (not a multiple of 4) and empty payload.
    expect(rejected("data:image/png;base64,iVBOR")).toMatch(/not valid base64/i);
    expect(rejected("data:image/png;base64,")).toMatch(/not valid base64/i);
  });

  it("rejects a file whose header is truncated or corrupt", () => {
    // Valid magic but nothing after it: the size cannot be read.
    const pngMagicOnly = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(rejected(toDataUrl("image/png", pngMagicOnly))).toMatch(/could not read the image size/i);
    const jpegNoFrame = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(rejected(toDataUrl("image/jpeg", jpegNoFrame))).toMatch(/could not read the image size/i);
    // Zero dimensions.
    expect(rejected(toDataUrl("image/png", makePng(0, 10)))).toMatch(/could not read the image size/i);
  });
});

describe("billLetterheadSchema", () => {
  const base = { billTagline: "Quality work", billAccentColor: "#0B2B5E" };

  it("accepts valid images, empty strings (remove) and omitted fields (keep)", () => {
    const parsed = billLetterheadSchema.parse({
      ...base,
      logoLeftUrl: toDataUrl("image/png", makePng()),
      logoRightUrl: "",
      // signatureUrl omitted
    });
    expect(parsed.logoRightUrl).toBe("");
    expect(parsed.signatureUrl).toBeUndefined();
  });

  it("names the offending field in the 422 message", () => {
    const result = billLetterheadSchema.safeParse({
      ...base,
      signatureUrl: toDataUrl("image/svg+xml", Buffer.from("<svg/>")),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/^Signature: SVG images are not allowed/);

    const left = billLetterheadSchema.safeParse({ ...base, logoLeftUrl: "data:image/png;base64,@@@@" });
    expect(left.success).toBe(false);
    if (!left.success) expect(left.error.issues[0]?.message).toMatch(/^Left logo: /);
  });

  it("no longer accepts any string that merely starts with data:image/", () => {
    expect(billLetterheadSchema.safeParse({ ...base, logoLeftUrl: "data:image/anything" }).success).toBe(false);
    expect(billLetterheadSchema.safeParse({ ...base, logoLeftUrl: "data:image/png;base64,AAAA" }).success).toBe(false);
  });

  it("validates the accent colour and tagline", () => {
    expect(billLetterheadSchema.safeParse({ ...base, billAccentColor: "red" }).success).toBe(false);
    expect(billLetterheadSchema.safeParse({ ...base, billTagline: "x".repeat(201) }).success).toBe(false);
  });

  it("lets an image identical to the stored one through (apps resend all three on every save)", () => {
    // A stored logo from before the limits: over 300 KB, so a NEW upload of it is refused...
    const legacy = toDataUrl("image/png", makePng(10, 10, LETTERHEAD_IMAGE_MAX_BYTES + 5000));
    expect(billLetterheadSchema.safeParse({ ...base, logoLeftUrl: legacy }).success).toBe(false);
    // ...but sending back exactly what is stored is a no-op, not a validation error.
    const lenient = buildBillLetterheadSchema({ logoLeftUrl: legacy });
    expect(lenient.safeParse({ ...base, logoLeftUrl: legacy }).success).toBe(true);
    // A different oversized image in the same field is still refused,
    expect(lenient.safeParse({ ...base, logoLeftUrl: legacy + "AAAA" }).success).toBe(false);
    // and so is the stored value in a DIFFERENT field.
    expect(lenient.safeParse({ ...base, signatureUrl: legacy }).success).toBe(false);
  });
});
