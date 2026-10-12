"use client";

import { useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Info } from "lucide-react";
import type { listDailyReadings, listDieselEntries } from "@/lib/services/siteAnalysis";
import type { Plain } from "@/lib/plain";
import { swrFetcher } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatHours } from "@/lib/utils/hours";
import { Pager, fmtDay, qs } from "./shared";

type Daily = Plain<NonNullable<Awaited<ReturnType<typeof listDailyReadings>>>>;
type Diesel = Plain<NonNullable<Awaited<ReturnType<typeof listDieselEntries>>>>;

const PAGE_SIZE = 15;
const hrs = (n: number) => (n === 0 ? "—" : formatHours(n).replace(" hrs", ""));
const reading = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

export const READING_DIFFERENCE_HELP =
  "Reading Difference = meter hours not assigned to Bucket or Brekar (e.g. Chaining / other / not specified).";

/** Daily Machine Reading table: server-side filtered and paginated (one row per day and machine). */
export function DailyReadingsTable({
  siteId,
  excavatorId,
  from,
  to,
  showMachine = true,
}: {
  siteId: string;
  excavatorId?: string;
  from?: string;
  to?: string;
  showMachine?: boolean;
}) {
  const [page, setPage] = useState(1);
  const filterKey = `${excavatorId ?? ""}|${from ?? ""}|${to ?? ""}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    // Filters changed: start again from the first page.
    setSeenKey(filterKey);
    setPage(1);
  }
  const { data } = useSWR<Daily>(
    `/api/sites/${siteId}/daily${qs({ excavatorId, from, to, page, pageSize: PAGE_SIZE })}`,
    swrFetcher,
    { keepPreviousData: true },
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-bold">Daily Machine Reading</p>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" title={READING_DIFFERENCE_HELP}>
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {READING_DIFFERENCE_HELP} Average = ((previous closing + diesel filled) − closing) ÷ hours, using only
          this machine&apos;s previous entry at this site.
        </p>
        {!data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading readings...</p>
        ) : data.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No approved readings for these filters.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {showMachine && <TableHead>Machine</TableHead>}
                  <TableHead>Operator</TableHead>
                  <TableHead className="text-right">Starting Reading</TableHead>
                  <TableHead className="text-right">Ending Reading</TableHead>
                  <TableHead className="text-right">Total Hours</TableHead>
                  <TableHead className="text-right">Bucket Hours</TableHead>
                  <TableHead className="text-right">Brekar Hours</TableHead>
                  <TableHead className="text-right">Diesel (L)</TableHead>
                  <TableHead className="text-right">Closing (L)</TableHead>
                  <TableHead className="text-right">Average (L/hr)</TableHead>
                  <TableHead className="text-right" title={READING_DIFFERENCE_HELP}>
                    Reading Difference
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={`${r.date}-${r.excavatorId}`}>
                    <TableCell className="whitespace-nowrap">{fmtDay(r.date)}</TableCell>
                    {showMachine && (
                      <TableCell className="whitespace-nowrap">
                        {r.machineName}
                        {r.machineNumber ? ` (${r.machineNumber})` : ""}
                      </TableCell>
                    )}
                    <TableCell>{r.operatorName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{reading(r.startReading)}</TableCell>
                    <TableCell className="text-right tabular-nums">{reading(r.endReading)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {r.flagged && (
                        <span title="The stored ending reading is lower than the starting reading; the recorded hours are shown.">
                          <AlertTriangle className="mr-1 inline size-3.5 text-destructive" aria-label="Reading needs checking" />
                        </span>
                      )}
                      {hrs(r.totalHours)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{hrs(r.bucketHours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{hrs(r.brekarHours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.diesel === 0 ? "—" : r.diesel}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.closingDiesel === null ? "—" : r.closingDiesel}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {r.dieselFlagged ? (
                        <span title={`Closing diesel is higher than what was available (${r.prevClosingDiesel ?? 0} L left + ${r.diesel} L filled). Check the readings.`}>
                          <AlertTriangle className="mr-1 inline size-3.5 text-destructive" aria-label="Diesel reading needs checking" />
                          Check
                        </span>
                      ) : r.average === null ? (
                        "N/A"
                      ) : (
                        r.average
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.readingDifference === 0 ? "—" : r.readingDifference}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={data.page} totalPages={data.totalPages} total={data.total} noun="row" onPage={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Individual diesel entries (date, machine, litres, notes) with totals that reconcile with the list. */
export function DieselEntriesList({
  siteId,
  excavatorId,
  from,
  to,
}: {
  siteId: string;
  excavatorId?: string;
  from?: string;
  to?: string;
}) {
  const [page, setPage] = useState(1);
  const filterKey = `${excavatorId ?? ""}|${from ?? ""}|${to ?? ""}`;
  const [seenKey, setSeenKey] = useState(filterKey);
  if (seenKey !== filterKey) {
    setSeenKey(filterKey);
    setPage(1);
  }
  const { data } = useSWR<Diesel>(
    `/api/sites/${siteId}/diesel${qs({ excavatorId, from, to, page, pageSize: PAGE_SIZE })}`,
    swrFetcher,
    { keepPreviousData: true },
  );
  if (!data) return <p className="py-4 text-center text-sm text-muted-foreground">Loading diesel entries...</p>;
  if (data.entries.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">No diesel entries for these filters.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead className="text-right">Litres</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{fmtDay(e.date)}</TableCell>
              <TableCell>
                {e.machineName}
                {e.machineNumber ? ` (${e.machineNumber})` : ""}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{e.litres}</TableCell>
              <TableCell className="text-muted-foreground">{e.notes ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager page={data.page} totalPages={data.totalPages} total={data.total} noun="entry" onPage={setPage} />
    </div>
  );
}
