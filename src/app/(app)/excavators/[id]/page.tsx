import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Pencil } from "lucide-react";
import { requireBusiness } from "@/lib/session";
import { getExcavatorDetail } from "@/lib/services/excavators";
import { listSiteOptions } from "@/lib/services/sites";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatHours } from "@/lib/utils/hours";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { CurrentWorkTab } from "./current-work-tab";
import { WorkHistoryTab } from "./work-history-tab";
import { ServiceTab } from "./service-tab";
import { AssignedOperatorCard } from "./assigned-operator-card";
import { SiteCard } from "./site-card";
import { DeleteExcavatorButton } from "./delete-excavator-button";

export default async function ExcavatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { businessId } = await requireBusiness();

  const [detail, siteOptions] = await Promise.all([getExcavatorDetail(businessId, id), listSiteOptions(businessId)]);
  if (!detail) notFound();

  const { excavator, activeWork, operatorWorkRequests, serviceStatus, idleDays, isIdleAlert, defaultSiteName } = detail;
  const tab = typeof sp.tab === "string" ? sp.tab : "current";

  return (
    <div>
      <PageHeader
        title={excavator.name}
        backHref="/excavators"
        action={
          <div className="flex shrink-0 gap-2">
            <Button
              size="lg"
              className="h-11"
              variant="secondary"
              nativeButton={false}
              render={<Link href={`/excavators/${excavator.id}/edit`} />}
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <DeleteExcavatorButton excavatorId={excavator.id} excavatorName={excavator.name} />
          </div>
        }
      />
      <div className="flex flex-col gap-4 px-4 pb-6 md:px-8">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {excavator.machineNumber && (
                <p className="text-sm text-muted-foreground">{excavator.machineNumber}</p>
              )}
              <p className="text-lg font-bold">{formatHours(excavator.currentHourMeter)}</p>
              <p
                className={
                  serviceStatus.overdue
                    ? "text-sm font-semibold text-destructive"
                    : serviceStatus.dueSoon
                      ? "text-sm font-semibold text-idle-foreground"
                      : "text-sm text-muted-foreground"
                }
              >
                {serviceStatus.overdue
                  ? `Service overdue by ${Math.abs(serviceStatus.dueInHours)} hrs`
                  : `Service due in ${serviceStatus.dueInHours} hrs`}
              </p>
            </div>
            <StatusBadge status={excavator.status} />
          </CardContent>
        </Card>

        {isIdleAlert && (
          <div className="card-hover flex items-center gap-3 rounded-xl border border-idle-foreground/15 bg-idle/60 px-3.5 py-3 text-sm font-semibold text-idle-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-idle-foreground/15">
              <AlertTriangle className="size-4 shrink-0" />
            </span>
            <span className="flex-1">This machine has been idle for {idleDays} days.</span>
          </div>
        )}

        <AssignedOperatorCard
          businessId={businessId}
          excavatorId={excavator.id}
          currentOperator={excavator.currentOperator}
        />

        <SiteCard
          excavatorId={excavator.id}
          currentSiteName={excavator.currentSite?.name ?? null}
          siteOptions={siteOptions}
        />

        <Tabs defaultValue={tab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="current">Work</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="service">Service</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="pt-4">
            <CurrentWorkTab
              businessId={businessId}
              excavatorId={excavator.id}
              currentHourMeter={excavator.currentHourMeter}
              currentOperatorName={excavator.currentOperator?.name ?? null}
              defaultSiteName={defaultSiteName}
              activeWork={activeWork}
              operatorWorkRequests={operatorWorkRequests}
            />
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <WorkHistoryTab
              businessId={businessId}
              excavatorId={excavator.id}
              filters={{
                customerId: typeof sp.customerId === "string" ? sp.customerId : undefined,
                operatorId: typeof sp.operatorId === "string" ? sp.operatorId : undefined,
                siteName: typeof sp.site === "string" ? sp.site : undefined,
                from: typeof sp.from === "string" ? sp.from : undefined,
                to: typeof sp.to === "string" ? sp.to : undefined,
              }}
            />
          </TabsContent>

          <TabsContent value="service" className="pt-4">
            <ServiceTab
              businessId={businessId}
              excavatorId={excavator.id}
              currentHourMeter={excavator.currentHourMeter}
              serviceStatus={serviceStatus}
            />
          </TabsContent>

          <TabsContent value="details" className="pt-4">
            <Card>
              <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
                <p className="text-muted-foreground">Brand</p>
                <p className="text-right font-semibold">{excavator.brand ?? "—"}</p>
                <p className="text-muted-foreground">Model</p>
                <p className="text-right font-semibold">{excavator.model ?? "—"}</p>
                <p className="text-muted-foreground">Purchase Date</p>
                <p className="text-right font-semibold">
                  {excavator.purchaseDate ? excavator.purchaseDate.toLocaleDateString("en-IN") : "—"}
                </p>
                <p className="text-muted-foreground">Starting Hour Meter</p>
                <p className="text-right font-semibold">{formatHours(excavator.startingHourMeter)}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
