"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploadField } from "@/components/image-upload-field";
import { cn } from "@/lib/utils";

const ACCENT_PRESETS = ["#0B2B5E", "#0e2347", "#2563eb", "#0d9488", "#ea580c", "#e11d48", "#16a34a"];

export function BillLetterheadForm({
  business,
}: {
  business: {
    logoLeftUrl: string | null;
    logoRightUrl: string | null;
    signatureUrl: string | null;
    billTagline: string | null;
    billAccentColor: string;
  };
}) {
  const { mutate } = useSWRConfig();
  const [accent, setAccent] = useState(business.billAccentColor);
  const [success, setSuccess] = useState(false);
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    await apiFetch("/api/settings/letterhead", { method: "PATCH", body: JSON.stringify(body) });
    await mutate("/api/settings");
    setSuccess(true);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    await run({
      logoLeftUrl: fd.get("logoLeftUrl") ?? "",
      logoRightUrl: fd.get("logoRightUrl") ?? "",
      signatureUrl: fd.get("signatureUrl") ?? "",
      billTagline: fd.get("billTagline") || undefined,
      billAccentColor: accent,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bill Letterhead</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <ImageUploadField name="logoLeftUrl" label="Logo (Left)" defaultValue={business.logoLeftUrl} />
            <ImageUploadField name="logoRightUrl" label="Logo (Right)" defaultValue={business.logoRightUrl} />
            <ImageUploadField name="signatureUrl" label="Signature" defaultValue={business.signatureUrl} shape="wide" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="billTagline" className="text-base">
              Tagline (Optional)
            </Label>
            <Input
              key={business.billTagline}
              id="billTagline"
              name="billTagline"
              placeholder="e.g. Excavation & Earthwork Services"
              defaultValue={business.billTagline ?? ""}
              className="h-12 text-base"
            />
          </div>

          <div>
            <Label className="mb-2 block text-base">Accent Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  className={cn(
                    "size-8 rounded-lg",
                    accent === c && "ring-2 ring-offset-2 ring-foreground/40",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 w-10 cursor-pointer rounded-lg border border-border"
              />
            </div>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {success && !error && <p className="text-sm font-medium text-working">Saved.</p>}
          <Button type="submit" size="lg" className="h-11 self-start" disabled={pending}>
            {pending ? "Saving..." : "Save Letterhead"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
