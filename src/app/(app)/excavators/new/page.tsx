import { requireBusiness } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { AddExcavatorForm } from "./add-excavator-form";

export default async function NewExcavatorPage() {
  const { businessId } = await requireBusiness();
  const business = await db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { defaultServiceIntervalHrs: true },
  });

  return (
    <div>
      <PageHeader title="Add Machine" backHref="/excavators" />
      <div className="px-4 pb-6 md:px-8">
        <AddExcavatorForm defaultServiceIntervalHrs={business.defaultServiceIntervalHrs} />
      </div>
    </div>
  );
}
