import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { getCustomerDetail } from "@/lib/services/customers";
import { PageHeader } from "@/components/page-header";
import { EditCustomerForm } from "./edit-customer-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { businessId } = await requireBusiness();

  const detail = await getCustomerDetail(businessId, id);
  if (!detail) notFound();

  return (
    <div>
      <PageHeader title="Edit Customer" backHref={`/customers/${id}`} />
      <div className="px-4 pb-6 md:px-8">
        <EditCustomerForm customer={detail.customer} />
      </div>
    </div>
  );
}
