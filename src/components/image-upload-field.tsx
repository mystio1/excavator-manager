"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 400 * 1024;

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
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Image is too large — please use one under 400KB");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setValue(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-base">{label}</Label>
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
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-white"
              aria-label={`Remove ${label}`}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={
              (shape === "wide" ? "h-14 w-28" : "h-14 w-14") +
              " flex items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
            }
          >
            <Upload className="size-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm font-semibold text-primary"
        >
          {value ? "Change" : "Upload"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
