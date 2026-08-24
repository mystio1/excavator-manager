import { db } from "@/lib/db";
import { requireBusiness } from "@/lib/session";
import { getAlerts } from "@/lib/services/dashboard";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { DesktopTopHeader } from "@/components/shell/desktop-top-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { businessId } = await requireBusiness();

  const [business, alerts] = await Promise.all([
    db.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { name: true, ownerName: true },
    }),
    getAlerts(businessId),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar businessName={business.name} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileTopBar businessName={business.name} alerts={alerts} />
        <DesktopTopHeader ownerName={business.ownerName} alerts={alerts} />
        <main className="flex-1 overflow-x-hidden bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
