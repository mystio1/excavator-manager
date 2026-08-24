import { db } from "@/lib/db";
import { generateBusinessCode, normalizeBusinessCode } from "@/lib/utils/businessCode";
import type { z } from "zod";
import type { bankAccountSchema, billLetterheadSchema, businessProfileSchema } from "@/lib/validation/settings";

export async function getBusinessSettings(businessId: string) {
  return db.business.findUniqueOrThrow({ where: { id: businessId } });
}

/** Invalidates the old code immediately — anyone mid-signup with the old
 * code will need the new one, same as rotating a leaked invite link. Pass a
 * customCode to set a specific one; left blank, a random one is generated. */
export async function regenerateBusinessCode(businessId: string, customCode?: string) {
  if (customCode) {
    const code = normalizeBusinessCode(customCode);
    const existing = await db.business.findUnique({ where: { code } });
    if (existing && existing.id !== businessId) {
      return { error: "That business code is already taken — try another one." } as const;
    }
    return { business: await db.business.update({ where: { id: businessId }, data: { code } }) } as const;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateBusinessCode();
    const existing = await db.business.findUnique({ where: { code } });
    if (!existing) {
      return { business: await db.business.update({ where: { id: businessId }, data: { code } }) } as const;
    }
  }
  throw new Error("Could not generate a unique business code");
}

export async function updateBusinessProfile(
  businessId: string,
  input: z.infer<typeof businessProfileSchema>,
) {
  return db.business.update({
    where: { id: businessId },
    data: {
      name: input.name,
      ownerName: input.ownerName,
      phone: input.phone,
      address: input.address || null,
      gstNumber: input.gstNumber || null,
      defaultServiceIntervalHrs: input.defaultServiceIntervalHrs,
      maintenanceAlertThresholdHrs: input.maintenanceAlertThresholdHrs,
    },
  });
}

export async function updateOperatorLanguage(businessId: string, operatorLanguage: "en" | "hi" | "mr") {
  return db.business.update({ where: { id: businessId }, data: { operatorLanguage } });
}

export async function updateBillLetterhead(
  businessId: string,
  input: z.infer<typeof billLetterheadSchema>,
) {
  return db.business.update({
    where: { id: businessId },
    data: {
      logoLeftUrl: input.logoLeftUrl || null,
      logoRightUrl: input.logoRightUrl || null,
      signatureUrl: input.signatureUrl || null,
      billTagline: input.billTagline || null,
      billAccentColor: input.billAccentColor,
    },
  });
}

export async function listBankAccounts(businessId: string) {
  return db.bankAccount.findMany({
    where: { businessId, isArchived: false },
    orderBy: { createdAt: "desc" },
  });
}

export async function addBankAccount(businessId: string, input: z.infer<typeof bankAccountSchema>) {
  if (input.isDefaultForGst) {
    await db.bankAccount.updateMany({ where: { businessId }, data: { isDefaultForGst: false } });
  }
  if (input.isDefaultForNonGst) {
    await db.bankAccount.updateMany({ where: { businessId }, data: { isDefaultForNonGst: false } });
  }

  return db.bankAccount.create({
    data: {
      businessId,
      label: input.label,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      ifsc: input.ifsc.toUpperCase(),
      bankName: input.bankName,
      branch: input.branch || null,
      isDefaultForGst: !!input.isDefaultForGst,
      isDefaultForNonGst: !!input.isDefaultForNonGst,
    },
  });
}

export async function archiveBankAccount(businessId: string, id: string) {
  return db.bankAccount.updateMany({
    where: { id, businessId },
    data: { isArchived: true },
  });
}
