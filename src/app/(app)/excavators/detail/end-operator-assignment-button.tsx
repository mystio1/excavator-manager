"use client";

import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-client";
import { useApiForm } from "@/lib/use-api-form";
import { Button } from "@/components/ui/button";

export function EndOperatorAssignmentButton({ excavatorId }: { excavatorId: string }) {
  const { mutate } = useSWRConfig();
  const { pending, run } = useApiForm(async () => {
    await apiFetch(`/api/excavators/${excavatorId}/assign-operator`, { method: "DELETE" });
    await mutate(`/api/excavators/${excavatorId}`);
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="border-destructive text-destructive hover:bg-destructive/10"
      disabled={pending}
      onClick={() => run(undefined)}
    >
      {pending ? "Ending..." : "End"}
    </Button>
  );
}
