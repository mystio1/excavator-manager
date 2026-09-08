import { NextResponse } from "next/server";
import { requireBusinessApi } from "@/lib/api-auth";
import { getBusinessSettings, listBankAccounts } from "@/lib/services/settings";
import { db } from "@/lib/db";

export async function GET() {
  const auth = await requireBusinessApi();
  if (auth.error) return auth.error;
  const { businessId, userId } = auth.session;

  const [business, bankAccounts, user] = await Promise.all([
    getBusinessSettings(businessId),
    listBankAccounts(businessId),
    db.user.findUnique({ where: { id: userId }, select: { appPinHash: true } }),
  ]);

  return NextResponse.json({ business, bankAccounts, hasPin: !!user?.appPinHash });
}
