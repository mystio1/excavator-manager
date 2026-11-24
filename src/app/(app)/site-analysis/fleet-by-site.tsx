"use client";

import Link from "next/link";
import useSWR from "swr";
import { Truck } from "lucide-react";
import { swrFetcher } from "@/lib/api-client";
import type { getFleetBySite } from "@/lib/services/siteAnalysis";
import type { Plain } from "@/lib/plain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SiteStatusBadge, qs } from "./shared";

type Fleet = Plain<Awaited<ReturnType<typeof getFleetBySite>>>;

const DOT: Record<string, string> = { WORKING: "bg-working", IDLE: "bg-idle-foreground", SERVICE: "bg-service" };

/** "Our machines by site": how many of the fleet are at each site, and which ones. */
export function FleetBySite() {
  const { data } = useSWR<Fleet>("/api/sites/fleet", swrFetcher);
  if (!data || data.total === 0) return null;
  const placed = data.total - data.unassigned.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Truck className="size-4 text-primary-text" />
            Our Machines by Site
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            {placed} of {data.total} at {data.sites.length} site{data.sites.length === 1 ? "" : "s"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {data.sites.map((s) => (
          <Link
            key={s.siteId}
            href={`/site-analysis/detail${qs({ id: s.siteId })}`}
            className="flex flex-col gap-2 rounded-xl border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold">{s.siteName}</p>
              <SiteStatusBadge status={s.siteStatus} />
            </div>
            <p className="text-sm">
              <span className="text-2xl font-extrabold tabular-nums">{s.machines.length}</span>{" "}
              machine{s.machines.length === 1 ? "" : "s"}
              <span className="text-muted-foreground"> · {s.working} working now</span>
            </p>
            <MachineChips machines={s.machines} />
          </Link>
        ))}
        {data.unassigned.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
            <p className="font-semibold text-muted-foreground">Not at any site</p>
            <p className="text-sm">
              <span className="text-2xl font-extrabold tabular-nums">{data.unassigned.length}</span> machine
              {data.unassigned.length === 1 ? "" : "s"}
            </p>
            <MachineChips machines={data.unassigned} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MachineChips({ machines }: { machines: Fleet["unassigned"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {machines.map((m) => (
        <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          <span className={cn("size-2 rounded-full", DOT[m.status] ?? "bg-muted-foreground")} aria-hidden />
          {m.name}
          <span className="sr-only"> ({m.status.toLowerCase()})</span>
        </span>
      ))}
    </div>
  );
}
