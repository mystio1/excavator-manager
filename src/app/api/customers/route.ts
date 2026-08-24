import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { createCustomer, listCustomers } from "@/lib/services/customers";
import { addCustomerSchema } from "@/lib/validation/customer";

export async function GET(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const tripDate = searchParams.get("tripDate") ?? undefined;

  const customers = await listCustomers(businessId, q, tripDate);
  return NextResponse.json({ customers });
}

export async function POST(req: Request) {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;

  const parsed = addCustomerSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  }

  const customer = await createCustomer(auth.session.businessId, parsed.data);
  return NextResponse.json({ customer });
}
