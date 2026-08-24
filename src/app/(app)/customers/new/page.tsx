import { PageHeader } from "@/components/page-header";
import { AddCustomerForm } from "./add-customer-form";

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Add Customer" backHref="/customers" />
      <div className="px-4 pb-6 md:px-8">
        <AddCustomerForm />
      </div>
    </div>
  );
}
