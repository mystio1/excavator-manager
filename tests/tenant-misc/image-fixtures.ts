import { crc32, deflateSync } from "node:zlib";

/**
 * Tiny, header-correct image files for the letterhead validation tests. They
 * are built byte by byte so each test controls exactly the field it checks
 * (declared type, magic bytes, dimensions, size).
 */

export const toDataUrl = (mime: string, bytes: Uint8Array | Buffer) =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A structurally valid PNG whose IHDR claims width x height. Only the first
 * scanline is stored, so it is a real (if truncated-in-meaning) small file —
 * the validator reads the header, it does not decode pixels. */
export function makePng(width = 8, height = 8, extraBytes = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const idat = deflateSync(Buffer.alloc(1 + Math.min(width, 64) * 3));
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
  ];
  // Padding goes in an ancillary text chunk so the file stays well-formed.
  if (extraBytes > 0) parts.push(pngChunk("tEXt", Buffer.alloc(extraBytes, 0x61)));
  parts.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** A JPEG with SOI, JFIF APP0, a baseline SOF0 frame header and EOI. */
export function makeJpeg(width = 8, height = 8, extraBytes = 0): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof0 = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ]);
  // A COM segment carries any padding (length field counts itself).
  const padLength = Math.min(extraBytes, 65000);
  const com = padLength > 0 ? Buffer.concat([Buffer.from([0xff, 0xfe, ((padLength + 2) >> 8) & 0xff, (padLength + 2) & 0xff]), Buffer.alloc(padLength, 0x61)]) : Buffer.alloc(0);
  const rest = extraBytes > padLength ? Buffer.alloc(extraBytes - padLength, 0x00) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, com, sof0, Buffer.from([0xff, 0xd9]), rest]);
}

/** A WebP container. `kind` selects the lossy (VP8), lossless (VP8L) or
 * extended (VP8X) bitstream header so every size parser branch is covered. */
export function makeWebp(width = 8, height = 8, kind: "VP8X" | "VP8L" | "VP8 " = "VP8X"): Buffer {
  let chunk: Buffer;
  if (kind === "VP8X") {
    chunk = Buffer.alloc(18);
    chunk.write("VP8X", 0, "ascii");
    chunk.writeUInt32LE(10, 4);
    chunk.writeUIntLE(width - 1, 12, 3);
    chunk.writeUIntLE(height - 1, 15, 3);
  } else if (kind === "VP8L") {
    chunk = Buffer.alloc(18);
    chunk.write("VP8L", 0, "ascii");
    chunk.writeUInt32LE(10, 4);
    chunk[8] = 0x2f;
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
    chunk.writeUInt32LE(bits >>> 0, 9);
  } else {
    chunk = Buffer.alloc(18);
    chunk.write("VP8 ", 0, "ascii");
    chunk.writeUInt32LE(10, 4);
    chunk.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a], 8);
    chunk.writeUInt16LE(width & 0x3fff, 14);
    chunk.writeUInt16LE(height & 0x3fff, 16);
  }
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + chunk.length, 4);
  riff.write("WEBP", 8, "ascii");
  return Buffer.concat([riff, chunk]);
}
