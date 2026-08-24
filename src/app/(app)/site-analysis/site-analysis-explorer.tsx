"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { formatDate } from "@/lib/utils/dates";
import { formatHours } from "@/lib/utils/hours";

type Reading = {
  id: string;
  siteId: string;
  siteName: string;
  excavatorId: string;
  excavatorName: string;
  machineNumber: string | null;
  customerId: string;
  customerName: string;
  startDate: Date;
  endDate: Date | null;
  startHourMeter: number;
  endHourMeter: number;
  totalHours: number;
  attachment: string | null;
  dieselLiters: number | null;
};

export function SiteAnalysisExplorer({
  readings,
  siteOptions,
  customerOptions,
}: {
  readings: Reading[];
  siteOptions: { id: string; name: string }[];
  customerOptions: { id: string; name: string }[];
}) {
  const [siteId, setSiteId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(readings.map((r) => [r.id, true])),
  );

  const machineOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; machineNumber: string | null }>();
    for (const r of readings) {
      if (!byId.has(r.excavatorId)) {
        byId.set(r.excavatorId, { id: r.excavatorId, name: r.excavatorName, machineNumber: r.machineNumber });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [readings]);

  const [machineSearch, setMachineSearch] = useState("");
  const [selectedMachineIds, setSelectedMachineIds] = useState<Record<string, boolean>>({});
  const anyMachineSelected = Object.values(selectedMachineIds).some(Boolean);
  const visibleMachineOptions = useMemo(
    () =>
      machineOptions.filter((m) =>
        `${m.name} ${m.machineNumber ?? ""}`.toLowerCase().includes(machineSearch.trim().toLowerCase()),
      ),
    [machineOptions, machineSearch],
  );

  const filtered = useMemo(
    () =>
      readings.filter(
        (r) =>
          (!siteId || r.siteId === siteId) &&
          (!customerId || r.customerId === customerId) &&
          (!anyMachineSelected || selectedMachineIds[r.excavatorId]),
      ),
    [readings, siteId, customerId, anyMachineSelected, selectedMachineIds],
  );

  const selectedReadings = filtered.filter((r) => selected[r.id]);

  const stats = useMemo(() => {
    let totalHours = 0;
    let bucketHours = 0;
    let breakerHours = 0;
    let otherHours = 0;
    let totalDiesel = 0;
    const excavatorIds = new Set<string>();
    let minStart = Infinity;
    let maxEnd = -Infinity;

    for (const r of selectedReadings) {
      totalHours += r.totalHours;
      totalDiesel += r.dieselLiters ?? 0;
      excavatorIds.add(r.excavatorId);
      minStart = Math.min(minStart, r.startHourMeter);
      maxEnd = Math.max(maxEnd, r.endHourMeter);

      const attachment = r.attachment?.toLowerCase() ?? "";
      if (attachment.includes("bucket")) bucketHours += r.totalHours;
      else if (attachment.includes("breaker")) breakerHours += r.totalHours;
      else otherHours += r.totalHours;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      totalHours: round(totalHours),
      bucketHours: round(bucketHours),
      breakerHours: round(breakerHours),
      otherHours: round(otherHours),
      totalDiesel: round(totalDiesel),
      avgLitersPerHour: totalHours > 0 ? round(totalDiesel / totalHours) : 0,
      singleMachine: excavatorIds.size === 1,
      startingReading: minStart === Infinity ? 0 : minStart,
      currentReading: maxEnd === -Infinity ? 0 : maxEnd,
    };
  }, [selectedReadings]);

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of filtered) next[r.id] = checked;
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <p className="mb-1.5 text-sm font-semibold text-muted-foreground">Site</p>
            <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)} className="h-11">
              <option value="">All Sites</option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex-1">
            <p className="mb-1.5 text-sm font-semibold text-muted-foreground">Customer</p>
            <NativeSelect value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-11">
              <option value="">All Customers</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">
              Machine{anyMachineSelected ? ` (${Object.values(selectedMachineIds).filter(Boolean).length} selected)` : ""}
            </p>
            {anyMachineSelected && (
              <button
                type="button"
                onClick={() => setSelectedMachineIds({})}
                className="text-sm font-semibold text-primary"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="text"
            value={machineSearch}
            onChange={(e) => setMachineSearch(e.target.value)}
            placeholder="Search machines..."
            className="h-10 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus:border-primary"
          />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {visibleMachineOptions.length === 0 && (
              <p className="py-2 text-center text-sm text-muted-foreground">No machines match.</p>
            )}
            {visibleMachineOptions.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/40">
                <input
                  type="checkbox"
                  checked={!!selectedMachineIds[m.id]}
                  onChange={(e) => setSelectedMachineIds((prev) => ({ ...prev, [m.id]: e.target.checked }))}
                  className="size-4"
                />
                {m.name}
                {m.machineNumber ? ` (${m.machineNumber})` : ""}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">
            Average — based on {selectedReadings.length} of {filtered.length} selected reading
            {filtered.length === 1 ? "" : "s"}
          </p>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            {stats.singleMachine && selectedReadings.length > 0 && (
              <>
                <p className="text-muted-foreground">Starting Reading</p>
                <p className="text-right font-semibold">{formatHours(stats.startingReading)}</p>
                <p className="text-muted-foreground">Current Reading</p>
                <p className="text-right font-semibold">{formatHours(stats.currentReading)}</p>
              </>
            )}
            <p className="text-muted-foreground">Bucket Hours</p>
            <p className="text-right font-semibold">{formatHours(stats.bucketHours)}</p>
            <p className="text-muted-foreground">Breaker Hours</p>
            <p className="text-right font-semibold">{formatHours(stats.breakerHours)}</p>
            {stats.otherHours > 0 && (
              <>
                <p className="text-muted-foreground">Other Hours</p>
                <p className="text-right font-semibold">{formatHours(stats.otherHours)}</p>
              </>
            )}
            <p className="text-muted-foreground">Total Hours</p>
            <p className="text-right font-semibold">{formatHours(stats.totalHours)}</p>
            <p className="text-muted-foreground">Diesel Received</p>
            <p className="text-right font-semibold">{stats.totalDiesel} L</p>
            <p className="text-muted-foreground">Avg. Diesel Usage</p>
            <p className="text-right font-bold text-primary">{stats.avgLitersPerHour} L/hr</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-muted-foreground">
            Readings ({filtered.length})
          </p>
          {filtered.length > 0 && (
            <div className="flex gap-3 text-sm font-semibold text-primary">
              <button type="button" onClick={() => toggleAll(true)}>
                Select All
              </button>
              <button type="button" onClick={() => toggleAll(false)}>
                Deselect All
              </button>
            </div>
          )}
        </div>

        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No completed readings match these filters.
            </CardContent>
          </Card>
        )}

        {filtered.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/40"
          >
            <input
              type="checkbox"
              checked={!!selected[r.id]}
              onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: e.target.checked }))}
              className="mt-1 size-4"
            />
            <span className="flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {r.excavatorName}
                  {r.machineNumber ? ` (${r.machineNumber})` : ""}
                </span>
                <span className="font-semibold">{formatHours(r.totalHours)}</span>
              </span>
              <span className="block text-muted-foreground">
                {r.siteName} · {r.customerName} · {formatDate(r.startDate)}
                {r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
              </span>
              {(r.attachment || r.dieselLiters != null) && (
                <span className="block text-xs text-muted-foreground">
                  {r.attachment ?? "—"}
                  {r.dieselLiters != null ? ` · ${r.dieselLiters} L diesel` : ""}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
