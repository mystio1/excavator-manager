"use client";

import { Button } from "@/components/ui/button";
import { showValue, type FieldChange } from "@/lib/utils/change-summary";

/**
 * The confirmation step shown after "Save" in an edit dialog: lists every field being changed (old → new)
 * and asks "Are you sure you want to change this?". Nothing is saved until the admin confirms.
 */
export function ChangeReview({
  changes,
  pending,
  error,
  note,
  onBack,
  onConfirm,
}: {
  changes: FieldChange[];
  pending: boolean;
  error?: string | null;
  /** Extra warning, e.g. that the work is already on a bill. */
  note?: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" role="group" aria-label="Confirm changes">
      <p className="text-base font-semibold">Are you sure you want to change this?</p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {changes.map((c) => (
          <li key={c.label} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
            <span className="font-medium">{c.label}</span>
            <span className="text-muted-foreground">
              <span className="line-through">{showValue(c.from)}</span>
              <span aria-hidden="true">{"  →  "}</span>
              <span className="sr-only"> changed to </span>
              <span className="font-semibold text-foreground">{showValue(c.to)}</span>
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{note}</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-12 flex-1" onClick={onBack} disabled={pending}>
          No, go back
        </Button>
        <Button type="button" className="h-12 flex-1" onClick={onConfirm} disabled={pending}>
          {pending ? "Saving..." : "Yes, save changes"}
        </Button>
      </div>
    </div>
  );
}
