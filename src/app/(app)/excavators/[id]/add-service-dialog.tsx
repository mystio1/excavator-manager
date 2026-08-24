"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Plus, Search, Wrench } from "lucide-react";
import { addComponentAction, createServiceRecordAction, type AddComponentState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";
import { COMPONENT_CATEGORIES, NOT_ACTIONED, SERVICE_ACTIONS } from "@/lib/validation/serviceRecord";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CatalogItem = { id: string; name: string; category: string };
type PrevItem = { serviceItemId: string; name: string; category: string; action: string; notes: string | null };
type Row = { checked: boolean; action: string; cost: string; brand: string; notes: string };

function emptyRow(action = "Serviced"): Row {
  return { checked: false, action, cost: "", brand: "", notes: "" };
}

export function AddServiceDialog({
  excavatorId,
  currentHourMeter,
  catalog: initialCatalog,
  previousItems,
  flagged,
}: {
  excavatorId: string;
  currentHourMeter: number;
  catalog: CatalogItem[];
  previousItems: PrevItem[];
  flagged: PrevItem[];
}) {
  const [state, formAction, isPending] = useActionState(createServiceRecordAction, undefined);
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);
  const today = new Date().toISOString().slice(0, 10);

  const [catalog, setCatalog] = useState<CatalogItem[]>(initialCatalog);
  const flaggedIds = useMemo(() => new Set(flagged.map((f) => f.serviceItemId)), [flagged]);
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const initial: Record<string, Row> = {};
    for (const item of initialCatalog) {
      initial[item.id] = flaggedIds.has(item.id) ? { ...emptyRow(), checked: true } : emptyRow();
    }
    return initial;
  });

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyRow()), ...patch } }));
  }

  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? catalog.filter((item) => item.name.toLowerCase().includes(q)) : catalog;
    const map = new Map<string, CatalogItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return COMPONENT_CATEGORIES.map((category) => ({ category, items: map.get(category) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [catalog, search]);

  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        catalog
          .filter((c) => rows[c.id]?.checked)
          .map((c) => {
            const row = rows[c.id]!;
            return {
              serviceItemId: c.id,
              action: row.action,
              cost: row.cost || 0,
              brand: row.brand || undefined,
              notes: row.notes || undefined,
            };
          }),
      ),
    [catalog, rows],
  );
  const selectedCount = catalog.filter((c) => rows[c.id]?.checked).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="lg" className="h-11" />}>
        <Wrench className="size-4" />
        Add Service
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Service</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {/* display:contents keeps this a real <form> (for the submit
              button below, associated via form="add-service-form") without
              a nested <form> around AddComponentInline's own form. */}
          <form id="add-service-form" action={formAction} className="contents">
          <input type="hidden" name="excavatorId" value={excavatorId} />
          <input type="hidden" name="items" value={itemsJson} readOnly />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Service Date</Label>
              <Input name="serviceDate" type="date" defaultValue={today} required className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Machine Hours</Label>
              <Input
                name="hourMeterAtService"
                type="number"
                step="0.1"
                min="0"
                defaultValue={currentHourMeter}
                required
                className="h-11"
              />
            </div>
          </div>

          {flagged.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-service/30 bg-service/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-service">
                <AlertTriangle className="size-4" />
                Suggested from last service
              </p>
              {flagged.map((f) => (
                <p key={f.serviceItemId} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{f.name}</span> was &ldquo;{f.action}&rdquo; last
                  time — pre-selected below.
                </p>
              ))}
            </div>
          )}

          {previousItems.length > 0 && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
                Previous Service Summary ({previousItems.length} items)
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {previousItems.map((item) => (
                  <div key={item.serviceItemId} className="flex items-center justify-between text-sm">
                    <span>{item.name}</span>
                    <span
                      className={cn(
                        "font-medium",
                        NOT_ACTIONED.has(item.action) ? "text-service" : "text-muted-foreground",
                      )}
                    >
                      {item.action}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search parts..."
              className="h-11 pl-9"
            />
          </div>

          {grouped.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No parts match &ldquo;{search}&rdquo;.</p>
          )}

          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <div key={group.category} className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-muted-foreground">{group.category}</p>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => {
                    const row = rows[item.id] ?? emptyRow();
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "rounded-lg border p-2.5",
                          row.checked && "border-primary bg-accent/40",
                          flaggedIds.has(item.id) && "border-service/40",
                        )}
                      >
                        <label className="flex items-center gap-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={row.checked}
                            onChange={(e) => updateRow(item.id, { checked: e.target.checked })}
                            className="size-4"
                          />
                          <span className="font-medium">{item.name}</span>
                        </label>
                        {row.checked && (
                          <div className="mt-2 grid grid-cols-2 gap-2 pl-6.5">
                            <NativeSelect
                              value={row.action}
                              onChange={(e) => updateRow(item.id, { action: e.target.value })}
                              className="h-10 text-sm"
                            >
                              {SERVICE_ACTIONS.map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </NativeSelect>
                            <Input
                              type="number"
                              min="0"
                              placeholder="Cost"
                              value={row.cost}
                              onChange={(e) => updateRow(item.id, { cost: e.target.value })}
                              className="h-10 text-sm"
                            />
                            <Input
                              placeholder="Brand (optional)"
                              value={row.brand}
                              onChange={(e) => updateRow(item.id, { brand: e.target.value })}
                              className="h-10 text-sm"
                            />
                            <Input
                              placeholder="Notes (optional)"
                              value={row.notes}
                              onChange={(e) => updateRow(item.id, { notes: e.target.value })}
                              className="h-10 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </form>

          <AddComponentInline
            onAdded={(component) => {
              setCatalog((prev) => [...prev, component]);
              setRows((prev) => ({ ...prev, [component.id]: { ...emptyRow(), checked: true } }));
            }}
          />

          {state?.error && <p className="text-sm font-medium text-destructive">{state.error}</p>}

          <DialogFooter className="-mx-0 -mb-0 rounded-none border-0 bg-transparent p-0 sm:justify-stretch">
            <Button
              type="submit"
              form="add-service-form"
              size="lg"
              className="h-12 w-full text-base"
              disabled={isPending || selectedCount === 0}
            >
              {isPending ? "Saving..." : `Save Service (${selectedCount} item${selectedCount === 1 ? "" : "s"})`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddComponentInline({
  onAdded,
}: {
  onAdded: (component: { id: string; name: string; category: string }) => void;
}) {
  const [state, formAction, isPending] = useActionState<AddComponentState, FormData>(addComponentAction, undefined);
  const [show, setShow] = useState(false);
  const lastAddedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state?.component && state.component.id !== lastAddedId.current) {
      lastAddedId.current = state.component.id;
      onAdded(state.component);
      setShow(false);
    }
  }, [state, onAdded]);

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary"
      >
        <Plus className="size-4" />
        Add New Component
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <form action={formAction} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Input name="name" placeholder="Component name" className="h-10 text-sm" />
          <NativeSelect name="category" defaultValue="Other" className="h-10 text-sm">
            {COMPONENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            {isPending ? "Adding..." : "Add"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShow(false)}>
            Cancel
          </Button>
        </div>
      </form>
      {state?.error && <p className="text-xs font-medium text-destructive">{state.error}</p>}
    </div>
  );
}
