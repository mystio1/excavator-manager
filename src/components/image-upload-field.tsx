"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  LETTERHEAD_IMAGE_MAX_BYTES,
  LETTERHEAD_IMAGE_MAX_DIMENSION,
  inspectLetterheadImage,
} from "@/lib/validation/settings";

// The server only accepts PNG / JPEG / WebP, at most 300 KB and 2000 x 2000 px
// (see validation/settings.ts — it is the real gatekeeper). Phone photos are
// far bigger than that, so a picked file is shrunk here first: scaled down to
// at most TARGET_DIMENSION px and re-encoded, so a normal photo still uploads.
const TARGET_DIMENSION = 800;
const FALLBACK_DIMENSIONS = [600, 400, 300];
const JPEG_QUALITIES = [0.85, 0.7];
/** Refuse to even try decoding something absurd (a 100 MB "image"). */
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const PASS_THROUGH_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_KB = LETTERHEAD_IMAGE_MAX_BYTES / 1024;

/** Decoded size of a base64 data URL, in bytes. */
function dataUrlBytes(dataUrl: string) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length / 4) * 3 - padding;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file could not be opened as an image. Please choose a PNG, JPG or WebP picture."));
    img.src = url;
  });
}

/** Draws `img` scaled so its longest side is `dimension` px (never enlarged).
 * `flatten` paints white underneath, for formats without transparency. */
function drawScaled(img: HTMLImageElement, dimension: number, flatten: boolean) {
  const scale = Math.min(1, dimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot resize images. Please choose a smaller picture.");
  if (flatten) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/** Turns the picked file into a data URL the server will accept: a small PNG /
 * JPEG / WebP is used as it is; anything bigger is scaled to ~800 px and
 * re-encoded (PNG kept for transparent logos when it fits, otherwise JPEG at
 * ~0.85 quality). Throws an Error with a user-facing message. */
async function prepareImage(file: File): Promise<string> {
  if (file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name)) {
    throw new Error("SVG images are not supported — please choose a PNG, JPG or WebP picture.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("That file is too large — please choose a picture under 15 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const longestSide = Math.max(img.naturalWidth, img.naturalHeight);

    const fitsAsIs =
      PASS_THROUGH_TYPES.includes(file.type) &&
      file.size <= LETTERHEAD_IMAGE_MAX_BYTES &&
      longestSide <= LETTERHEAD_IMAGE_MAX_DIMENSION;
    if (fitsAsIs) return await readAsDataUrl(file);

    const first = drawScaled(img, TARGET_DIMENSION, false);
    // Only formats that can carry transparency are worth keeping as PNG.
    const transparent =
      (file.type === "" || /^image\/(png|webp|gif)$/.test(file.type)) &&
      hasTransparency(first.ctx, first.canvas.width, first.canvas.height);

    for (const dimension of [TARGET_DIMENSION, ...FALLBACK_DIMENSIONS]) {
      if (transparent) {
        const png = drawScaled(img, dimension, false).canvas.toDataURL("image/png");
        if (dataUrlBytes(png) <= LETTERHEAD_IMAGE_MAX_BYTES) return png;
      }
      const flat = drawScaled(img, dimension, true).canvas;
      for (const quality of JPEG_QUALITIES) {
        const jpeg = flat.toDataURL("image/jpeg", quality);
        if (dataUrlBytes(jpeg) <= LETTERHEAD_IMAGE_MAX_BYTES) return jpeg;
      }
    }
    throw new Error(`This picture is still larger than ${MAX_KB} KB even after shrinking it. Please choose a simpler or smaller picture.`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ImageUploadField({
  name,
  label,
  defaultValue,
  shape = "square",
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  shape?: "square" | "wide";
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const dataUrl = await prepareImage(file);
      // The same check the server runs, so what is sent is accepted.
      const check = inspectLetterheadImage(dataUrl);
      if (!check.ok) throw new Error(check.message);
      setValue(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use this image.");
    } finally {
      setBusy(false);
      // Lets the same file be picked again after a failure.
      input.value = "";
    }
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <Label id={labelId} className="text-base">
        {label}
      </Label>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className={
                shape === "wide"
                  ? "h-14 w-28 rounded-lg border border-border object-contain bg-white"
                  : "h-14 w-14 rounded-lg border border-border object-contain bg-white"
              }
            />
            <button
              type="button"
              onClick={() => setValue("")}
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-red-600 text-white"
              aria-label={`Remove ${label}`}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={`Upload ${label}`}
            className={
              (shape === "wide" ? "h-14 w-28" : "h-14 w-14") +
              " flex items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary-text"
            }
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label={`${value ? "Change" : "Upload"} ${label}`}
          className="min-h-8 text-sm font-semibold text-primary-text disabled:opacity-60"
        >
          {busy ? "Processing..." : value ? "Change" : "Upload"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" tabIndex={-1} aria-hidden="true" />
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPG or WebP. Large pictures are shrunk automatically.</p>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
