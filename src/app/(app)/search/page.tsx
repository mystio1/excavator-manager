"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Search, Truck, Users, HardHat, Receipt } from "lucide-react";
import type { globalSearch, SearchGroup } from "@/lib/services/search";
import type { Plain } from "@/lib/plain";
import { apiFetch, swrFetcher } from "@/lib/api-client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import Loading from "../loading";

type SearchResults = Plain<Awaited<ReturnType<typeof globalSearch>>>;

/** Each group shows its first hits; "Show more" loads this many at a time. */
const MORE_PAGE_SIZE = 20;

export default function SearchPage() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const { data } = useSWR<{ results: SearchResults }>(
    q ? `/api/search?q=${encodeURIComponent(q)}` : null,
    swrFetcher,
  );

  return (
    <div>
      <PageHeader title={q ? `Results for "${q}"` : "Search"} backHref="/dashboard" />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        {!q && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
              <Search className="size-8" />
              <p>Search machines, customers, operators or bill numbers.</p>
            </CardContent>
          </Card>
        )}

        {q && !data && <Loading />}

        {/* Keyed by the query so each search starts with fresh "show more" state. */}
        {q && data && <Results key={q} results={data.results} q={q} />}
      </div>
    </div>
  );
}

function Results({ results, q }: { results: SearchResults; q: string }) {
  const totalResults =
    results.excavators.length + results.customers.length + results.operators.length + results.bills.length;

  return (
    <>
      {totalResults === 0 && (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            No results found for &ldquo;{q}&rdquo;.
          </CardContent>
        </Card>
      )}

      <ResultSection
        title="Machines"
        icon={Truck}
        group="excavators"
        q={q}
        first={results.excavators}
        firstCursor={results.nextCursors.excavators}
        render={(e) => (
          <Link key={e.id} href={`/excavators/detail?id=${e.id}`}>
            <Card className="card-hover">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{e.name}</p>
                  {e.machineNumber && <p className="text-sm text-muted-foreground">{e.machineNumber}</p>}
                </div>
                <StatusBadge status={e.status} />
              </CardContent>
            </Card>
          </Link>
        )}
      />

      <ResultSection
        title="Customers"
        icon={Users}
        group="customers"
        q={q}
        first={results.customers}
        firstCursor={results.nextCursors.customers}
        render={(c) => (
          <Link key={c.id} href={`/customers/detail?id=${c.id}`}>
            <Card className="card-hover">
              <CardContent>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-muted-foreground">{c.companyName || c.mobile}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />

      <ResultSection
        title="Operators"
        icon={HardHat}
        group="operators"
        q={q}
        first={results.operators}
        firstCursor={results.nextCursors.operators}
        render={(o) => (
          <Link key={o.id} href={`/operators/detail?id=${o.id}`}>
            <Card className="card-hover">
              <CardContent>
                <p className="font-semibold">{o.name}</p>
                <p className="text-sm text-muted-foreground">{o.mobile}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />

      <ResultSection
        title="Bills"
        icon={Receipt}
        group="bills"
        q={q}
        first={results.bills}
        firstCursor={results.nextCursors.bills}
        render={(b) => (
          <Link key={b.id} href={`/bills/detail?id=${b.id}`}>
            <Card className="card-hover">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{b.billNumber}</p>
                  <p className="text-sm text-muted-foreground">{b.customer.name}</p>
                </div>
                <p className="font-semibold">{formatCurrency(b.totalAmount)}</p>
              </CardContent>
            </Card>
          </Link>
        )}
      />
    </>
  );
}

function ResultSection<T extends { id: string }>({
  title,
  icon: Icon,
  group,
  q,
  first,
  firstCursor,
  render,
}: {
  title: string;
  icon: typeof Truck;
  group: SearchGroup;
  q: string;
  first: T[];
  firstCursor: string | null;
  render: (item: T) => React.ReactNode;
}) {
  const [extra, setExtra] = useState<{ items: T[]; nextCursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = [...first, ...(extra?.items ?? [])];
  const nextCursor = extra ? extra.nextCursor : firstCursor;
  if (items.length === 0) return null;

  async function showMore() {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await apiFetch<{ results: Record<SearchGroup, T[]>; nextCursor: string | null }>(
        `/api/search?q=${encodeURIComponent(q)}&type=${group}&limit=${MORE_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      setExtra({ items: [...(extra?.items ?? []), ...page.results[group]], nextCursor: page.nextCursor });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more results");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </p>
      <div className="flex flex-col gap-2">{items.map(render)}</div>
      {nextCursor && (
        <Button type="button" variant="secondary" disabled={loading} onClick={showMore}>
          {loading ? "Loading..." : `Show more ${title.toLowerCase()}`}
        </Button>
      )}
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
