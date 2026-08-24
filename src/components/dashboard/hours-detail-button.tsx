"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type AttachmentHours = { attachment: string; hours: number };
type MachineHours = {
  id: string;
  name: string;
  machineNumber: string | null;
  hours: number;
  breakdown: AttachmentHours[];
};

export function HoursDetailButton({ machines }: { machines: MachineHours[] }) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setExpandedId(null);
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="shrink-0 text-xs font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline"
          />
        }
      >
        Detail
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hours This Month — By Machine</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {machines.length === 0 && <p className="text-sm text-muted-foreground">No machines yet.</p>}
          {machines.map((m) => {
            const isOpen = expandedId === m.id;
            const showBreakdown = m.breakdown.length > 0 && !(m.breakdown.length === 1 && m.hours === 0);
            return (
              <div key={m.id} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : m.id)}
                  disabled={!showBreakdown}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {m.name}
                      {m.machineNumber ? <span className="text-muted-foreground"> ({m.machineNumber})</span> : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="font-bold tabular-nums">{m.hours} hrs</span>
                    {showBreakdown &&
                      (isOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      ))}
                  </span>
                </button>
                {isOpen && showBreakdown && (
                  <div className="flex flex-col gap-1 border-t px-3 py-2">
                    {m.breakdown.map((b) => (
                      <div key={b.attachment} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{b.attachment}</span>
                        <span className="font-semibold tabular-nums">{b.hours} hrs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
