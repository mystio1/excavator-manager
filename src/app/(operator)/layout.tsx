import { db } from "@/lib/db";
import { requireOperator } from "@/lib/session";
import { ExcavatorLogo } from "@/components/excavator-logo";
import { operatorLogoutAction } from "@/app/(operator-auth)/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { LogOut } from "lucide-react";
import Link from "next/link";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { operatorId } = await requireOperator();

  const operator = await db.operator.findUniqueOrThrow({
    where: { id: operatorId },
    select: { name: true },
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)]">
        <Link href="/operator" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ExcavatorLogo className="size-5" />
          </div>
          <span className="font-bold">{operator.name}</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggleButton />
          <form action={operatorLogoutAction}>
            <Button type="submit" size="icon-sm" variant="ghost" aria-label="Log out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 bg-background pb-8">{children}</main>
    </div>
  );
}
