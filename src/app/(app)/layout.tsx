import { requireBusiness } from "@/lib/session";
import { getAlerts } from "@/lib/services/dashboard";
import { Sidebar } from "@/components/shell/sidebar";
import { BottomNav } from "@/components/shell/bottom-nav";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { DesktopTopHeader } from "@/components/shell/desktop-top-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // TEMPORARY: timing instrumentation to find the real production
  // bottleneck behind reported slow navigation — remove once diagnosed.
  // eslint-disable-next-line react-hooks/purity -- diagnostic only, value never reaches rendering
  const layoutStart = performance.now();
  const { businessId, businessName, ownerName } = await requireBusiness();
  // eslint-disable-next-line react-hooks/purity -- diagnostic only, value never reaches rendering
  const afterAuth = performance.now();
  const alerts = await getAlerts(businessId);
  // eslint-disable-next-line react-hooks/purity -- diagnostic only, value never reaches rendering
  const afterAlerts = performance.now();
  console.log(
    `[perf] layout: requireBusiness=${(afterAuth - layoutStart).toFixed(0)}ms getAlerts=${(afterAlerts - afterAuth).toFixed(0)}ms total=${(afterAlerts - layoutStart).toFixed(0)}ms`,
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar businessName={businessName} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileTopBar businessName={businessName} alerts={alerts} />
        <DesktopTopHeader ownerName={ownerName} alerts={alerts} />
        <main className="flex-1 overflow-x-hidden bg-background pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
