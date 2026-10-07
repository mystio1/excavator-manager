"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Pencil, Trash2 } from "lucide-react";
import { ApiError, apiFetch, swrFetcher } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { AttachmentPicker } from "@/components/attachment-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type EditableSession = {
  id: string;
  /** Optimistic-concurrency token: sent back as expectedVersion on save/delete. */
  version: number;
  customerId: string;
  operatorId: string;
  site: { name: string };
  startDate: string | Date;
  endDate: string | Date | null;
  startHourMeter: number;
  endHourMeter: number | null;
  totalHours: number;
  dieselLiters: number | null;
  attachment: string | null;
  notes: string | null;
  status: string;
};

const day = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Admin can correct any job at any time — customer, site, operator, dates,
 * readings, hours, diesel, tool, notes — or remove it (unless billed). */
export function EditSessionButton({ session, invalidateKey }: { session: EditableSession; invalidateKey: string }) {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The version the dialog was opened with. SWR may refresh `session` in the
  // background while the user is typing; saving is still judged against what
  // they actually started from.
  const [loadedVersion, setLoadedVersion] = useState(session.version);
  const [conflict, setConflict] = useState(false);
  const { data: customersData } = useSWR<{ customers: { id: string; name: string }[] }>(
    open ? "/api/customers/options" : null,
    swrFetcher,
  );
  const { data: operatorsData } = useSWR<{ operators: { id: string; name: string }[] }>(
    open ? "/api/operators/options" : null,
    swrFetcher,
  );
  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    setConflict(false);
    try {
      await apiFetch(`/api/work-sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, expectedVersion: loadedVersion }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESOURCE_MODIFIED") setConflict(true);
      throw e;
    }
  });

  function onOpenChange(next: boolean) {
    if (next) {
      setLoadedVersion(session.version);
      setConflict(false);
      setDeleteError(null);
    }
    setOpen(next);
  }

  /** After a conflict: fetch the latest data and close, so reopening shows it. */
  async function reloadLatest() {
    await refresh();
    setOpen(false);
  }

  async function refresh() {
    await mutate(invalidateKey);
    await mutate((k) => typeof k === "string" && (k.startsWith("/api/excavators") || k.startsWith("/api/dashboard")));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ok = await run({
      customerId: fd.get("customerId"),
      operatorId: fd.get("operatorId"),
      siteName: fd.get("siteName"),
      startDate: fd.get("startDate"),
      endDate: fd.get("endDate") || undefined,
      startHourMeter: fd.get("startHourMeter"),
      endHourMeter: fd.get("endHourMeter") || undefined,
      totalHours: fd.get("totalHours") || undefined,
      dieselLiters: fd.get("dieselLiters") || undefined,
      attachment: fd.get("attachment") || undefined,
      notes: fd.get("notes") || undefined,
    });
    if (ok) {
      await refresh();
      setOpen(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this work record and all its readings? This cannot be undone.")) return;
    setDeleting(true);
    setDeleteError(null);
    setConflict(false);
    try {
      await apiFetch(`/api/work-sessions/${session.id}?expectedVersion=${loadedVersion}`, { method: "DELETE" });
      await refresh();
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "RESOURCE_MODIFIED") setConflict(true);
      setDeleteError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setDeleting(false);
    }
  }

  const customers = customersData?.customers ?? [];
  const operators = operatorsData?.operators ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label="Edit work record" />
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Work Record</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customerId">Customer</Label>
            <NativeSelect id="customerId" name="customerId" defaultValue={session.customerId} required className="h-11">
              {!customers.some((c) => c.id === session.customerId) && (
                <option value={session.customerId}>Current customer</option>
              )}
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="operatorId">Operator</Label>
            <NativeSelect id="operatorId" name="operatorId" defaultValue={session.operatorId} required className="h-11">
              {!operators.some((o) => o.id === session.operatorId) && (
                <option value={session.operatorId}>Current operator</option>
              )}
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="siteName">Site</Label>
            <Input id="siteName" name="siteName" defaultValue={session.site.name} required className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={day(session.startDate)} required className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={day(session.endDate)} className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startHourMeter">Start Reading</Label>
              <Input id="startHourMeter" name="startHourMeter" type="number" step="0.1" min="0" defaultValue={session.startHourMeter} required className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endHourMeter">End Reading</Label>
              <Input id="endHourMeter" name="endHourMeter" type="number" step="0.1" min="0" defaultValue={session.endHourMeter ?? ""} className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="totalHours">Total Hours</Label>
              <Input id="totalHours" name="totalHours" type="number" step="0.1" min="0" defaultValue={session.totalHours} className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dieselLiters">Diesel (L)</Label>
              <Input id="dieselLiters" name="dieselLiters" type="number" step="0.1" min="0" defaultValue={session.dieselLiters ?? ""} className="h-11" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            If this job has approved daily readings, its hours come from those readings instead of Total Hours.
          </p>
          <AttachmentPicker name="attachment" label="Attachment / Tool Used (Optional)" defaultValue={session.attachment} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Note (Optional)</Label>
            <Input id="notes" name="notes" defaultValue={session.notes ?? ""} className="h-11" />
          </div>

          {(error || deleteError) && <p role="alert" className="text-sm font-medium text-destructive">{error ?? deleteError}</p>}
          {conflict && (
            <Button type="button" variant="outline" className="h-11" onClick={reloadLatest}>
              Reload latest version
            </Button>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 text-destructive" onClick={onDelete} disabled={deleting || pending}>
              <Trash2 className="size-4" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <Button type="submit" size="lg" className="h-12 flex-1 text-base" disabled={pending || deleting}>
              {pending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
