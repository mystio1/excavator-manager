"use client";

import { useState } from "react";
import { mutate } from "swr";
import { ArrowDown, ArrowUp, Check, ListOrdered } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type Machine = { id: string; name: string; machineNumber: string | null };

/** Admin-controlled machine order: up/down buttons (work on touch + mouse),
 * saved in one request and reflected everywhere machines are listed. */
export function ReorderMachines({ machines }: { machines: Machine[] }) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<Machine[]>(machines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/excavators/reorder", {
        method: "PUT",
        body: JSON.stringify({ orderedIds: order.map((m) => m.id) }),
      });
      await mutate(() => true);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save order");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Button
        variant="outline"
        size="lg"
        className="h-11"
        onClick={() => {
          setOrder(machines);
          setEditing(true);
        }}
        disabled={machines.length < 2}
      >
        <ListOrdered className="size-5" />
        Reorder
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Arrange machines in your order</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Check className="size-4" />
            {saving ? "Saving..." : "Save Order"}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <ol className="flex flex-col gap-2">
        {order.map((m, i) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
            <span className="w-6 text-center font-semibold text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {m.name}
              {m.machineNumber ? ` (${m.machineNumber})` : ""}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Move ${m.name} up`}
              onClick={() => move(i, -1)}
              disabled={i === 0}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Move ${m.name} down`}
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
            >
              <ArrowDown className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}
