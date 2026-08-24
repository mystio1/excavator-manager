import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { getExcavatorDetail } from "@/lib/services/excavators";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EditExcavatorForm } from "./edit-excavator-form";

export default async function EditExcavatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId } = await requireBusiness();

  const [detail, business] = await Promise.all([
    getExcavatorDetail(businessId, id),
    db.business.findUniqueOrThrow({ where: { id: businessId }, select: { defaultServiceIntervalHrs: true } }),
  ]);
  if (!detail) notFound();

  return (
    <div>
      <PageHeader title="Edit Machine" backHref={`/excavators/${id}`} />
      <div className="px-4 pb-6 md:px-8">
        <EditExcavatorForm excavator={detail.excavator} defaultServiceIntervalHrs={business.defaultServiceIntervalHrs} />
      </div>
    </div>
  );
}
