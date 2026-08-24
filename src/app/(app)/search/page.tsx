import Link from "next/link";
import { Search, Truck, Users, HardHat, Receipt } from "lucide-react";
import { requireBusiness } from "@/lib/session";
import { globalSearch } from "@/lib/services/search";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { businessId } = await requireBusiness();
  const { q = "" } = await searchParams;
  const results = await globalSearch(businessId, q);
  const totalResults =
    results.excavators.length + results.customers.length + results.operators.length + results.bills.length;

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

        {q && totalResults === 0 && (
          <Card>
            <CardContent className="py-14 text-center text-muted-foreground">
              No results found for &ldquo;{q}&rdquo;.
            </CardContent>
          </Card>
        )}

        {results.excavators.length > 0 && (
          <ResultSection title="Machines" icon={Truck}>
            {results.excavators.map((e) => (
              <Link key={e.id} href={`/excavators/${e.id}`}>
                <Card className="card-hover">
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{e.name}</p>
                      {e.machineNumber && (
                        <p className="text-sm text-muted-foreground">{e.machineNumber}</p>
                      )}
                    </div>
                    <StatusBadge status={e.status} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </ResultSection>
        )}

        {results.customers.length > 0 && (
          <ResultSection title="Customers" icon={Users}>
            {results.customers.map((c) => (
              <Link key={c.id} href={`/customers/${c.id}`}>
                <Card className="card-hover">
                  <CardContent>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{c.companyName || c.mobile}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </ResultSection>
        )}

        {results.operators.length > 0 && (
          <ResultSection title="Operators" icon={HardHat}>
            {results.operators.map((o) => (
              <Link key={o.id} href={`/operators/${o.id}`}>
                <Card className="card-hover">
                  <CardContent>
                    <p className="font-semibold">{o.name}</p>
                    <p className="text-sm text-muted-foreground">{o.mobile}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </ResultSection>
        )}

        {results.bills.length > 0 && (
          <ResultSection title="Bills" icon={Receipt}>
            {results.bills.map((b) => (
              <Link key={b.id} href={`/bills/${b.id}`}>
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
            ))}
          </ResultSection>
        )}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Truck;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4" />
        {title}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
