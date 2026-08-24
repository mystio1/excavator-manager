import { PageHeader } from "@/components/page-header";
import { AddOperatorForm } from "./add-operator-form";

export default function NewOperatorPage() {
  return (
    <div>
      <PageHeader title="Add Operator" backHref="/operators" />
      <div className="px-4 pb-6 md:px-8">
        <AddOperatorForm />
      </div>
    </div>
  );
}
