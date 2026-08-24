import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getBusinessSettings, listBankAccounts } from "@/lib/services/settings";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId } = auth.session;

  const [business, bankAccounts] = await Promise.all([
    getBusinessSettings(businessId),
    listBankAccounts(businessId),
  ]);

  return NextResponse.json({ business, bankAccounts });
}
