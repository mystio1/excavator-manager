"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Copy, FileText, Plus, Receipt, Trash2, Zap } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/native-select";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

export type BillFormOptions = {
  customers: { id: string; name: string; companyName: string | null }[];
  sites: { id: string; name: string }[];
  excavators: {
    id: string;
    name: string;
    machineNumber: string | null;
    currentSite?: { name: string } | null;
  }[];
  bankAccounts: { id: string; label: string; isDefaultForGst: boolean; isDefaultForNonGst: boolean }[];
  businessGstNumber: string | null;
  nextNonGstNumber: string;
};

type Row = {
  key: number;
  id?: string;
  excavatorId: string;
  siteName: string;
  fromDate: string;
  toDate: string;
  hours: string;
  rate: string;
  attachment: string;
};

export type BillFormInitial = {
  customerId: string;
  billDate: string;
  billNumber: string;
  billType: "GST" | "NON_GST";
  gstPercentage: number | null;
  buyerGstin: string;
  bankAccountId: string;
  notes: string;
  showCustomerPhone: boolean;
  transportCharges: number;
  fuelCharges: number;
  extraCharges: number;
  bucketCharge: number;
  breakerCharge: number;
  discount: number;
  items: { id: string; attachment: string; excavatorId: string; siteName: string; fromDate: string; toDate: string; hours: number; ratePerHour: number }[];
  // Direct bills only
  excavatorId: string;
  fromDate: string;
  toDate: string;
  bucketHours: number;
  bucketRate: number;
  breakerHours: number;
  breakerRate: number;
  dieselLiters: number;
  dieselPricePerLiter: number;
};

const TAX_RATES = [5, 12, 18, 28];
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => Number(s) || 0;
const today = () => new Date().toISOString().slice(0, 10);

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  // Hard cap so a typo'd year can't freeze the page.
  for (let i = 0; i < 62 && cur <= to; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

type Col = "machine" | "site" | "from" | "to" | "hours" | "rate";

/** One form for both "Summary Bill" creation and editing any existing bill.
 * The grid is built for speed: Quick Fill generates a whole date range for
 * several machines at once, Enter moves down a column (adding a copied row at
 * the end), pasting a column from Excel fills downward, and rate/site/dates
 * carry over from the row above. */
export function BillEditorForm({
  options,
  mode,
  billId,
  isDirect = false,
  initial,
}: {
  options: BillFormOptions;
  mode: "create" | "edit";
  billId?: string;
  isDirect?: boolean;
  initial?: BillFormInitial;
}) {
  const router = useRouter();
  const keyRef = useRef((initial?.items.length ?? 0) + 1);
  const nextKey = () => keyRef.current++;
  const gridRef = useRef<HTMLDivElement>(null);

  const machineById = useMemo(() => new Map(options.excavators.map((e) => [e.id, e])), [options.excavators]);
  const defaultSiteFor = (excavatorId: string) => machineById.get(excavatorId)?.currentSite?.name ?? "";

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [billDate, setBillDate] = useState(initial?.billDate ?? today());
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      ? initial.items.map((i, idx) => ({
          key: idx + 1,
          id: i.id,
          excavatorId: i.excavatorId,
          siteName: i.siteName,
          fromDate: i.fromDate,
          toDate: i.toDate,
          hours: String(i.hours),
          rate: String(i.ratePerHour),
          attachment: i.attachment,
        }))
      : [],
  );

  const [transport, setTransport] = useState(String(initial?.transportCharges || ""));
  const [fuel, setFuel] = useState(String(initial?.fuelCharges || ""));
  const [extra, setExtra] = useState(String(initial?.extraCharges || ""));
  const [bucket, setBucket] = useState(String(initial?.bucketCharge || ""));
  const [breaker, setBreaker] = useState(String(initial?.breakerCharge || ""));
  const [discount, setDiscount] = useState(String(initial?.discount || ""));
  const [billType, setBillType] = useState<"GST" | "NON_GST">(initial?.billType ?? "NON_GST");
  const [gstPercentage, setGstPercentage] = useState(initial?.gstPercentage ?? 18);
  const [manualNumber, setManualNumber] = useState(false);
  const [billNumber, setBillNumber] = useState(initial?.billNumber ?? "");
  const [buyerGstin, setBuyerGstin] = useState(initial?.buyerGstin ?? "");
  const defaultBank = (type: "GST" | "NON_GST") =>
    options.bankAccounts.find((b) => (type === "GST" ? b.isDefaultForGst : b.isDefaultForNonGst))?.id ?? "";
  const [bankAccountId, setBankAccountId] = useState(initial ? initial.bankAccountId : defaultBank("NON_GST"));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showCustomerPhone, setShowCustomerPhone] = useState(initial?.showCustomerPhone ?? true);

  // Direct-bill-only fields (edit mode)
  const [d, setD] = useState({
    excavatorId: initial?.excavatorId ?? "",
    fromDate: initial?.fromDate ?? today(),
    toDate: initial?.toDate ?? today(),
    bucketHours: String(initial?.bucketHours || ""),
    bucketRate: String(initial?.bucketRate || ""),
    breakerHours: String(initial?.breakerHours || ""),
    breakerRate: String(initial?.breakerRate || ""),
    dieselLiters: String(initial?.dieselLiters || ""),
    dieselPricePerLiter: String(initial?.dieselPricePerLiter || ""),
  });

  // Quick Fill panel
  const [qfMachines, setQfMachines] = useState<string[]>([]);
  const [qfFrom, setQfFrom] = useState(today());
  const [qfTo, setQfTo] = useState(today());
  const [qfHours, setQfHours] = useState("8");
  const [qfRate, setQfRate] = useState("");
  const [qfSite, setQfSite] = useState("");
  const [qfAttachment, setQfAttachment] = useState("");
  const [qfPerDay, setQfPerDay] = useState(true);
  const [qfError, setQfError] = useState<string | null>(null);

  const { error, pending, run } = useApiForm(async (body: Record<string, unknown>) => {
    if (mode === "edit") {
      await apiFetch(`/api/bills/${billId}`, { method: "PATCH", body: JSON.stringify(body) });
      await mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
      router.push(`/bills/detail?id=${billId}`);
    } else {
      const { bill } = await apiFetch<{ bill: { id: string } }>("/api/bills/summary", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await mutate((k) => typeof k === "string" && (k.startsWith("/api/bills") || k.startsWith("/api/dashboard")));
      router.push(`/bills/detail?id=${bill.id}`);
    }
  });

  const rowAmount = (r: Row) => round2(num(r.hours) * num(r.rate));
  const totals = useMemo(() => {
    let subtotal: number;
    let taxable: number;
    let dieselAdvance = 0;
    if (isDirect) {
      subtotal = round2(
        round2(num(d.bucketHours) * num(d.bucketRate)) + round2(num(d.breakerHours) * num(d.breakerRate)),
      );
      taxable = round2(subtotal + num(transport));
      dieselAdvance = round2(num(d.dieselLiters) * num(d.dieselPricePerLiter));
    } else {
      subtotal = round2(rows.reduce((s, r) => s + round2(num(r.hours) * num(r.rate)), 0));
      taxable =
        subtotal + num(transport) + num(fuel) + num(extra) + num(bucket) + num(breaker) - num(discount);
    }
    const tax = billType === "GST" ? round2((taxable * gstPercentage) / 100) : 0;
    const hours = round2(rows.reduce((s, r) => s + num(r.hours), 0));
    return { subtotal, taxable, tax, hours, dieselAdvance, total: round2(taxable + tax - dieselAdvance) };
  }, [rows, d, transport, fuel, extra, bucket, breaker, discount, billType, gstPercentage, isDirect]);

  // ---- grid helpers --------------------------------------------------------

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function newRowFrom(prev: Row | undefined): Row {
    return {
      key: nextKey(),
      excavatorId: prev?.excavatorId ?? options.excavators[0]?.id ?? "",
      siteName: prev?.siteName ?? defaultSiteFor(options.excavators[0]?.id ?? ""),
      // Carry the day forward so "next row" is normally the next day.
      fromDate: prev ? addDays(prev.toDate, 1) : today(),
      toDate: prev ? addDays(prev.toDate, 1) : today(),
      hours: prev?.hours ?? "",
      rate: prev?.rate ?? "",
      attachment: prev?.attachment ?? "",
    };
  }

  function addRow() {
    setRows((prev) => [...prev, newRowFrom(prev[prev.length - 1])]);
  }

  function duplicateRow(key: number) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      if (i < 0) return prev;
      const copy = { ...newRowFrom(prev[i]), id: undefined };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function focusCell(rowIndex: number, col: Col) {
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${rowIndex}-${col}"]`);
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    });
  }

  function onCellKeyDown(e: React.KeyboardEvent, rowIndex: number, col: Col) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (rowIndex === rows.length - 1) addRow();
    focusCell(rowIndex + 1, col);
  }

  /** Pasting a column (or a row) copied from Excel/Sheets into hours or rate
   * fills downward from the current row, adding rows as needed. */
  function onNumberPaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, col: "hours" | "rate") {
    const text = e.clipboardData.getData("text");
    const values = text
      .split(/[\r\n\t]+/)
      .map((v) => v.trim().replace(/,/g, ""))
      .filter((v) => v !== "");
    if (values.length < 2 || values.some((v) => Number.isNaN(Number(v)))) return;
    e.preventDefault();
    setRows((prev) => {
      const next = [...prev];
      values.forEach((v, i) => {
        const idx = rowIndex + i;
        if (idx >= next.length) next.push(newRowFrom(next[next.length - 1]));
        next[idx] = { ...next[idx], [col]: v };
      });
      return next;
    });
  }

  function applyRateToAll(rate: string) {
    setRows((prev) => prev.map((r) => ({ ...r, rate })));
  }

  function quickFill() {
    setQfError(null);
    if (qfMachines.length === 0) return setQfError("Pick at least one machine");
    if (!qfFrom || !qfTo || qfTo < qfFrom) return setQfError("Check the dates");
    if (num(qfHours) <= 0) return setQfError("Enter the hours");
    const days = daysBetween(qfFrom, qfTo);
    const added: Row[] = [];
    for (const machineId of qfMachines) {
      const site = qfSite.trim() || defaultSiteFor(machineId);
      if (qfPerDay) {
        for (const day of days) {
          added.push({
            key: nextKey(),
            excavatorId: machineId,
            siteName: site,
            fromDate: day,
            toDate: day,
            hours: qfHours,
            rate: qfRate,
            attachment: qfAttachment,
          });
        }
      } else {
        added.push({
          key: nextKey(),
          excavatorId: machineId,
          siteName: site,
          fromDate: qfFrom,
          toDate: qfTo,
          hours: qfHours,
          rate: qfRate,
          attachment: qfAttachment,
        });
      }
    }
    setRows((prev) => [...prev, ...added]);
  }

  // ---- submit --------------------------------------------------------------

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const common = {
      customerId,
      billDate,
      billType,
      billNumber: billNumber.trim() || undefined,
      gstPercentage: billType === "GST" ? gstPercentage : undefined,
      buyerGstin: buyerGstin.trim() || undefined,
      bankAccountId: bankAccountId || undefined,
      notes: notes.trim() || undefined,
      showCustomerPhone,
      transportCharges: num(transport),
    };
    if (isDirect) {
      await run({
        ...common,
        excavatorId: d.excavatorId,
        fromDate: d.fromDate,
        toDate: d.toDate,
        bucketHours: num(d.bucketHours),
        bucketRate: num(d.bucketRate),
        breakerHours: num(d.breakerHours),
        breakerRate: num(d.breakerRate),
        dieselLiters: num(d.dieselLiters),
        dieselPricePerLiter: num(d.dieselPricePerLiter),
      });
      return;
    }
    await run({
      ...common,
      items: rows.map((r) => ({
        id: r.id,
        excavatorId: r.excavatorId,
        siteName: r.siteName,
        attachment: r.attachment || undefined,
        fromDate: r.fromDate,
        toDate: r.toDate,
        hours: num(r.hours),
        ratePerHour: num(r.rate),
      })),
      fuelCharges: num(fuel),
      extraCharges: num(extra),
      bucketCharge: num(bucket),
      breakerCharge: num(breaker),
      discount: num(discount),
    });
  }

  const noRows = !isDirect && rows.length === 0;
  const invalidRow = !isDirect && rows.some((r) => !r.excavatorId || !r.siteName.trim() || num(r.hours) <= 0);
  const needsNumber = billType === "GST" || mode === "edit" || manualNumber;
  const canSubmit = !!customerId && !noRows && !invalidRow && (!needsNumber || billNumber.trim() !== "");

  const money = (label: string, value: string, set: (v: string) => void) => (
    <div className="flex flex-col gap-2">
      <Label className="text-sm">{label}</Label>
      <Input type="number" min="0" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} className="h-11" />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Customer</Label>
            <NativeSelect
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              className="h-11"
            >
              <option value="" disabled>
                Choose a customer
              </option>
              {options.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.companyName ? ` (${c.companyName})` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Bill Date</Label>
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} required className="h-11" />
          </div>
        </CardContent>
      </Card>

      {isDirect ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-base font-semibold">Machine, Period &amp; Hours</p>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Machine</Label>
              <NativeSelect value={d.excavatorId} onChange={(e) => setD({ ...d, excavatorId: e.target.value })} className="h-11">
                {options.excavators.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.machineNumber ? ` (${m.machineNumber})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-sm">From Date</Label>
                <Input type="date" value={d.fromDate} onChange={(e) => setD({ ...d, fromDate: e.target.value })} className="h-11" />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-sm">To Date</Label>
                <Input type="date" value={d.toDate} onChange={(e) => setD({ ...d, toDate: e.target.value })} className="h-11" />
              </div>
              {money("Bucket Hours", d.bucketHours, (v) => setD({ ...d, bucketHours: v }))}
              {money("Bucket Rate / Hour", d.bucketRate, (v) => setD({ ...d, bucketRate: v }))}
              {money("Breaker Hours", d.breakerHours, (v) => setD({ ...d, breakerHours: v }))}
              {money("Breaker Rate / Hour", d.breakerRate, (v) => setD({ ...d, breakerRate: v }))}
              {money("Transport Charges", transport, setTransport)}
              {money("Diesel Litres (advance)", d.dieselLiters, (v) => setD({ ...d, dieselLiters: v }))}
              {money("Diesel Price / Litre", d.dieselPricePerLiter, (v) => setD({ ...d, dieselPricePerLiter: v }))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                <p className="text-base font-semibold">Quick Fill</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Pick machines and a date range — one row per day is created for each machine. Edit any cell afterwards.
              </p>
              <div className="flex flex-wrap gap-2">
                {options.excavators.map((m) => {
                  const on = qfMachines.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setQfMachines((p) => (on ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-semibold",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {m.name}
                      {m.machineNumber ? ` (${m.machineNumber})` : ""}
                    </button>
                  );
                })}
                {options.excavators.length === 0 && <p className="text-sm text-muted-foreground">Add a machine first.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={qfFrom}
                    onChange={(e) => {
                      setQfFrom(e.target.value);
                      if (qfTo < e.target.value) setQfTo(e.target.value);
                    }}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={qfTo} min={qfFrom} onChange={(e) => setQfTo(e.target.value)} className="h-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{qfPerDay ? "Hours / day" : "Total hours"}</Label>
                  <Input type="number" min="0" step="0.1" inputMode="decimal" value={qfHours} onChange={(e) => setQfHours(e.target.value)} className="h-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Rate / hour</Label>
                  <Input type="number" min="0" inputMode="decimal" value={qfRate} onChange={(e) => setQfRate(e.target.value)} className="h-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Tool (optional)</Label>
                  <NativeSelect value={qfAttachment} onChange={(e) => setQfAttachment(e.target.value)} className="h-10 text-sm">
                    <option value="">None</option>
                    <option value="Bucket">Bucket</option>
                    <option value="Breaker">Breaker</option>
                  </NativeSelect>
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label className="text-xs">Site (blank = machine&rsquo;s site)</Label>
                  <Input list="bill-sites" value={qfSite} onChange={(e) => setQfSite(e.target.value)} className="h-10" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="radio" checked={qfPerDay} onChange={() => setQfPerDay(true)} className="size-4" />
                  One row per day
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="radio" checked={!qfPerDay} onChange={() => setQfPerDay(false)} className="size-4" />
                  One row for whole period
                </label>
                <Button type="button" onClick={quickFill} className="ml-auto">
                  <Plus className="size-4" /> Add Rows
                </Button>
              </div>
              {qfError && <p className="text-sm font-medium text-destructive">{qfError}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold">
                  Bill Rows <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    placeholder="Rate for all"
                    className="h-9 w-28"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyRateToAll(e.currentTarget.value);
                      }
                    }}
                    onBlur={(e) => e.currentTarget.value && applyRateToAll(e.currentTarget.value)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={options.excavators.length === 0}>
                    <Plus className="size-4" /> Row
                  </Button>
                </div>
              </div>
              <datalist id="bill-sites">
                {options.sites.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>

              <div ref={gridRef} className="-mx-2 overflow-x-auto px-2">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[1.4fr_1.3fr_1fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_4.5rem] gap-2 pb-1 text-xs font-semibold text-muted-foreground">
                    <span>Machine</span>
                    <span>Site</span>
                    <span>From</span>
                    <span>To</span>
                    <span>Hours</span>
                    <span>Rate</span>
                    <span>Tool</span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>
                  {rows.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No rows yet — use Quick Fill above or add a row.
                    </p>
                  )}
                  {rows.map((r, i) => (
                    <div
                      key={r.key}
                      className="grid grid-cols-[1.4fr_1.3fr_1fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_4.5rem] items-center gap-2 border-t py-1.5"
                    >
                      <NativeSelect
                        data-cell={`${i}-machine`}
                        value={r.excavatorId}
                        onChange={(e) => {
                          const prevDefault = defaultSiteFor(r.excavatorId);
                          updateRow(r.key, {
                            excavatorId: e.target.value,
                            // Follow the machine's own site unless the user typed a custom one.
                            siteName: !r.siteName || r.siteName === prevDefault ? defaultSiteFor(e.target.value) : r.siteName,
                          });
                        }}
                        onKeyDown={(e) => onCellKeyDown(e, i, "machine")}
                        className="h-10 px-2 text-sm"
                      >
                        {options.excavators.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.machineNumber ? ` (${m.machineNumber})` : ""}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input
                        data-cell={`${i}-site`}
                        list="bill-sites"
                        value={r.siteName}
                        onChange={(e) => updateRow(r.key, { siteName: e.target.value })}
                        onKeyDown={(e) => onCellKeyDown(e, i, "site")}
                        className="h-10 px-2 text-sm"
                      />
                      <Input
                        data-cell={`${i}-from`}
                        type="date"
                        value={r.fromDate}
                        onChange={(e) =>
                          updateRow(r.key, {
                            fromDate: e.target.value,
                            // Keep single-day rows single-day while editing the date.
                            toDate: r.toDate === r.fromDate || r.toDate < e.target.value ? e.target.value : r.toDate,
                          })
                        }
                        onKeyDown={(e) => onCellKeyDown(e, i, "from")}
                        className="h-10 px-2 text-sm"
                      />
                      <Input
                        data-cell={`${i}-to`}
                        type="date"
                        min={r.fromDate}
                        value={r.toDate}
                        onChange={(e) => updateRow(r.key, { toDate: e.target.value })}
                        onKeyDown={(e) => onCellKeyDown(e, i, "to")}
                        className="h-10 px-2 text-sm"
                      />
                      <Input
                        data-cell={`${i}-hours`}
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={r.hours}
                        onChange={(e) => updateRow(r.key, { hours: e.target.value })}
                        onKeyDown={(e) => onCellKeyDown(e, i, "hours")}
                        onPaste={(e) => onNumberPaste(e, i, "hours")}
                        className="h-10 px-2 text-sm"
                      />
                      <Input
                        data-cell={`${i}-rate`}
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={r.rate}
                        onChange={(e) => updateRow(r.key, { rate: e.target.value })}
                        onKeyDown={(e) => onCellKeyDown(e, i, "rate")}
                        onPaste={(e) => onNumberPaste(e, i, "rate")}
                        className="h-10 px-2 text-sm"
                      />
                      <NativeSelect
                        value={r.attachment}
                        onChange={(e) => updateRow(r.key, { attachment: e.target.value })}
                        className="h-10 px-2 text-sm"
                      >
                        <option value="">—</option>
                        <option value="Bucket">Bucket</option>
                        <option value="Breaker">Breaker</option>
                      </NativeSelect>
                      <span className="text-right text-sm font-semibold tabular-nums">{formatCurrency(rowAmount(r))}</span>
                      <div className="flex justify-end gap-0.5">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicate row" onClick={() => duplicateRow(r.key)}>
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove row"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(r.key)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {rows.length > 0 && (
                    <div className="grid grid-cols-[1.4fr_1.3fr_1fr_1fr_0.7fr_0.7fr_0.9fr_0.9fr_4.5rem] gap-2 border-t pt-2 text-sm font-bold">
                      <span className="col-span-4">Total</span>
                      <span className="tabular-nums">{totals.hours}</span>
                      <span />
                      <span />
                      <span className="text-right tabular-nums">{formatCurrency(totals.subtotal)}</span>
                      <span />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tip: press Enter to jump to the same cell on the next row (a new row is added at the end). Paste a column of
                hours or rates copied from Excel to fill downward.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-base font-semibold">Extra Charges</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {money("Transport", transport, setTransport)}
                {money("Fuel", fuel, setFuel)}
                {money("Extra", extra, setExtra)}
                {num(bucket) > 0 && money("Bucket Charge", bucket, setBucket)}
                {num(breaker) > 0 && money("Breaker Charge", breaker, setBreaker)}
                {money("Discount", discount, setDiscount)}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">Bill Type</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            {(["NON_GST", "GST"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setBillType(t);
                  if (mode === "create") setBankAccountId(defaultBank(t));
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
                  billType === t ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {t === "GST" ? <FileText className="size-4" /> : <Receipt className="size-4" />}
                {t === "GST" ? "GST Bill" : "Non-GST"}
              </button>
            ))}
          </div>

          {billType === "GST" && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">GST Rate</Label>
              <div className="flex gap-2">
                {TAX_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setGstPercentage(r)}
                    className={cn(
                      "flex-1 rounded-lg border py-2 text-sm font-semibold",
                      gstPercentage === r ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {r}%
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">Seller GSTIN</Label>
                  <Input value={options.businessGstNumber ?? "Set in Settings"} disabled className="h-11" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">Buyer GSTIN (Optional)</Label>
                  <Input value={buyerGstin} onChange={(e) => setBuyerGstin(e.target.value)} className="h-11" />
                </div>
              </div>
            </div>
          )}

          {mode === "edit" || billType === "GST" ? (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bill Number</Label>
              <Input
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder={billType === "GST" ? "e.g. INV-0012" : "e.g. NG-0059"}
                required
                className="h-11"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={manualNumber}
                  onChange={(e) => setManualNumber(e.target.checked)}
                  className="size-4"
                />
                Enter bill number manually
              </label>
              {manualNumber ? (
                <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. NG-0059" required className="h-11" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Next bill number: <span className="font-semibold text-foreground">{options.nextNonGstNumber}</span>
                </p>
              )}
            </div>
          )}

          {options.bankAccounts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Bank Account to Print on Bill</Label>
              <NativeSelect value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="h-11">
                <option value="">None</option>
                {options.bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={showCustomerPhone}
              onChange={(e) => setShowCustomerPhone(e.target.checked)}
              className="size-4"
            />
            Show customer&rsquo;s phone number on bill
          </label>

          <div className="flex flex-col gap-2">
            <Label className="text-sm">Notes (Optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <p className="mb-1 text-base font-semibold">Review Amount</p>
          <div className="flex justify-between text-muted-foreground">
            <span>{isDirect ? "Bucket + Breaker" : `Hours × Rate (${totals.hours} hrs)`}</span>
            <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
          </div>
          {billType === "GST" && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({gstPercentage}%)</span>
              <span className="tabular-nums">{formatCurrency(totals.tax)}</span>
            </div>
          )}
          {totals.dieselAdvance > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Diesel Advance</span>
              <span className="tabular-nums">-{formatCurrency(totals.dieselAdvance)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending || !canSubmit}>
        {pending ? "Saving..." : mode === "edit" ? "Save Changes" : "Generate Bill"}
      </Button>
      {!canSubmit && (
        <p className="-mt-2 text-center text-xs text-muted-foreground">
          {!customerId
            ? "Choose a customer"
            : noRows
              ? "Add at least one row"
              : invalidRow
                ? "Every row needs a machine, a site and hours"
                : "Enter the bill number"}
        </p>
      )}
    </form>
  );
}
