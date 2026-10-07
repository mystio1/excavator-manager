import { signOut } from "@/lib/auth";
import { json, withApi } from "@/lib/with-api";

export const POST = withApi("auth.logout", async () => {
  await signOut({ redirect: false });
  return json({ ok: true });
});
