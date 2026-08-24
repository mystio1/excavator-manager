import { endOperatorAssignmentAction } from "../actions";
import { Button } from "@/components/ui/button";

export function EndOperatorAssignmentButton({ excavatorId }: { excavatorId: string }) {
  return (
    <form action={endOperatorAssignmentAction}>
      <input type="hidden" name="excavatorId" value={excavatorId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="border-destructive text-destructive hover:bg-destructive/10"
      >
        End
      </Button>
    </form>
  );
}
