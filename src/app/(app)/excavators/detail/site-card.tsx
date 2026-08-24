"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { MapPin } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SiteCard({
  excavatorId,
  currentSiteName,
  siteOptions,
}: {
  excavatorId: string;
  currentSiteName: string | null;
  siteOptions: { id: string; name: string }[];
}) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const { error, pending, run } = useApiForm(async (siteName: string) => {
    await apiFetch(`/api/excavators/${excavatorId}/site`, { method: "PATCH", body: JSON.stringify({ siteName }) });
    await mutate(`/api/excavators/${excavatorId}`);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const siteName = new FormData(e.currentTarget).get("siteName") as string;
    if (await run(siteName)) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Site Location</p>
            <p className="font-bold">{currentSiteName ?? "Not set"}</p>
          </div>
        </div>
        <DialogTrigger render={<Button size="sm" variant="secondary" />}>
          {currentSiteName ? "Change" : "Set"}
        </DialogTrigger>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentSiteName ? "Change Site Location" : "Set Site Location"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This stays fixed for the machine until you (or an approved operator request) change it again — it won&rsquo;t
          reset day to day.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="siteName" className="text-base">
              Site
            </Label>
            <Input
              key={currentSiteName}
              id="siteName"
              name="siteName"
              list="site-options"
              defaultValue={currentSiteName ?? ""}
              placeholder="e.g. Wagholi"
              required
              className="h-12 text-base"
              autoFocus
            />
            <datalist id="site-options">
              {siteOptions.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
              {pending ? "Saving..." : "Save Site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
