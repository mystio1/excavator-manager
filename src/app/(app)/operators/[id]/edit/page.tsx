import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { getOperatorDetail } from "@/lib/services/operators";
import { PageHeader } from "@/components/page-header";
import { EditOperatorForm } from "./edit-operator-form";

export default async function EditOperatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId } = await requireBusiness();

  const detail = await getOperatorDetail(businessId, id);
  if (!detail) notFound();

  return (
    <div>
      <PageHeader title="Edit Operator" backHref={`/operators/${id}`} />
      <div className="px-4 pb-6 md:px-8">
        <EditOperatorForm operator={detail.operator} />
      </div>
    </div>
  );
}
