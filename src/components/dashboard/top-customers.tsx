import Link from "next/link";
import { formatCurrency } from "@/lib/utils/currency";

type CustomerRow = {
  customerId: string;
  name: string;
  revenue: number;
  received: number;
  pending: number;
};

const MEDALS = ["🥇", "🥈", "🥉"];

export function TopCustomers({ customers }: { customers: CustomerRow[] }) {
  return (
    <div className="flex flex-col gap-1">
      {customers.map((c, i) => (
        <Link
          key={c.customerId}
          href={`/customers/${c.customerId}`}
          className="card-hover flex items-center justify-between gap-2 rounded-xl border border-transparent p-3 hover:border-border hover:bg-accent/40"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-base">
              {MEDALS[i] ?? i + 1}
            </span>
            <p className="truncate text-[15px] font-bold">{c.name}</p>
          </div>
          <div className="shrink-0 text-right text-sm">
            <p className="text-base font-extrabold tabular-nums">{formatCurrency(c.revenue)}</p>
            <p className={c.pending > 0.01 ? "text-xs font-medium text-destructive" : "text-xs font-medium text-working"}>
              {c.pending > 0.01 ? `${formatCurrency(c.pending)} pending` : "Fully received"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
