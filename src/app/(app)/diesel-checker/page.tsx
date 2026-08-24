import { PageHeader } from "@/components/page-header";
import { DieselCheckerForm } from "./diesel-checker-form";

export default function DieselCheckerPage() {
  return (
    <div>
      <PageHeader title="Diesel Average Checker" />
      <div className="px-4 pb-6 md:px-8">
        <DieselCheckerForm />
      </div>
    </div>
  );
}
