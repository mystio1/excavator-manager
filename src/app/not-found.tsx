import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-extrabold text-primary-text" aria-hidden="true">
        404
      </p>
      <h1 className="text-xl font-bold">We couldn&rsquo;t find that page</h1>
      <p className="text-sm text-muted-foreground">The link may be old, or the record may have been deleted.</p>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        Go to dashboard
      </Button>
    </main>
  );
}
