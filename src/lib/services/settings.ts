import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fail } from "@/lib/api-error";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { withTx, type Tx } from "@/lib/tx";
import { generateBusinessCode, normalizeBusinessCode } from "@/lib/utils/businessCode";
import type { z } from "zod";
import type { bankAccountSchema, billLetterheadSchema, businessProfileSchema } from "@/lib/validation/settings";

export async function getBusinessSettings(businessId: string) {
  return db.business.findUniqueOrThrow({ where: { id: businessId } });
}

/** The three letterhead images as currently stored (see buildBillLetterheadSchema). */
export async function getLetterheadImages(businessId: string) {
  return db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { logoLeftUrl: true, logoRightUrl: true, signatureUrl: true },
  });
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Serializes concurrent settings writes so each audit row's before/after pair
 * is a true successive pair (and two saves cannot interleave field by field). */
async function lockBusiness(tx: Tx, businessId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Business" WHERE "id" = ${businessId} FOR NO KEY UPDATE`;
}

const CODE_TAKEN ="That business code is already taken — try another one.";

/** Invalidates the old code immediately — anyone mid-signup with the old
 * code will need the new one, same as rotating a leaked invite link. Pass a
 * customCode to set a specific one; left blank, a random one is generated.
 * Audited (the code is what operators use to join this business). */
export async function regenerateBusinessCode(businessId: string, actor: AuditActor, customCode?: string) {
  const setCode = (code: string) =>
    withTx(undefined, async (tx) => {
      await lockBusiness(tx, businessId);
      const before = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { code: true } });
      const business = await tx.business.update({ where: { id: businessId }, data: { code } });
      await recordAudit(tx, {
        businessId,
        actor,
        action: "business.code.regenerate",
        entityType: "Business",
        entityId: businessId,
        before,
        after: { code: business.code },
        details: { custom: !!customCode },
      });
      return business;
    });

  if (customCode) {
    const code = normalizeBusinessCode(customCode);
    const existing = await db.business.findUnique({ where: { code }, select: { id: true } });
    if (existing && existing.id !== businessId) return fail("CONFLICT", CODE_TAKEN);
    try {
      return { business: await setCode(code) } as const;
    } catch (error) {
      // Lost a race with another business claiming the same code.
      if (isUniqueViolation(error)) return fail("CONFLICT", CODE_TAKEN);
      throw error;
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateBusinessCode();
    const existing = await db.business.findUnique({ where: { code }, select: { id: true } });
    if (existing) continue;
    try {
      return { business: await setCode(code) } as const;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error("Could not generate a unique business code");
}

/** The business-profile fields, as audited (service intervals included — they
 * drive every machine's maintenance alerts). */
const PROFILE_SELECT = {
  name: true,
  ownerName: true,
  phone: true,
  address: true,
  gstNumber: true,
  defaultServiceIntervalHrs: true,
  maintenanceAlertThresholdHrs: true,
} as const;

export async function updateBusinessProfile(
  businessId: string,
  actor: AuditActor,
  input: z.infer<typeof businessProfileSchema>,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockBusiness(tx, businessId);
    const before = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: PROFILE_SELECT });
    const after = await tx.business.update({
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
      select: PROFILE_SELECT,
    });
    const changed = (Object.keys(PROFILE_SELECT) as (keyof typeof PROFILE_SELECT)[]).filter(
      (key) => before[key] !== after[key],
    );
    await recordAudit(tx, {
      businessId,
      actor,
      action: "business.profile.update",
      entityType: "Business",
      entityId: businessId,
      before,
      after,
      details: { changed },
    });
    return after;
  });
}

export async function updateOperatorLanguage(
  businessId: string,
  actor: AuditActor,
  operatorLanguage: "en" | "hi" | "mr",
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockBusiness(tx, businessId);
    const before = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { operatorLanguage: true } });
    const after = await tx.business.update({
      where: { id: businessId },
      data: { operatorLanguage },
      select: { operatorLanguage: true },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "business.operator_language.update",
      entityType: "Business",
      entityId: businessId,
      before,
      after,
    });
    return after;
  });
}

const LETTERHEAD_SELECT = {
  logoLeftUrl: true,
  logoRightUrl: true,
  signatureUrl: true,
  billTagline: true,
  billAccentColor: true,
} as const;

/** Audit view of the letterhead. The three images are inline data: URIs of up
 * to ~400 KB each — storing them in every audit row would bloat the (append-
 * only) trail, so each is recorded as a size + SHA-256 fingerprint instead,
 * which is enough to tell WHAT changed and prove which image was in use. */
function letterheadAuditView(row: {
  logoLeftUrl: string | null;
  logoRightUrl: string | null;
  signatureUrl: string | null;
  billTagline: string | null;
  billAccentColor: string;
}) {
  const fingerprint = (value: string | null) =>
    value ? { length: value.length, sha256: createHash("sha256").update(value).digest("hex") } : null;
  return {
    logoLeft: fingerprint(row.logoLeftUrl),
    logoRight: fingerprint(row.logoRightUrl),
    signature: fingerprint(row.signatureUrl),
    billTagline: row.billTagline,
    billAccentColor: row.billAccentColor,
  };
}

/** Updates the bill letterhead. An image field that is omitted keeps what is
 * stored; "" removes it. Bills already generated keep their own frozen copy. */
export async function updateBillLetterhead(
  businessId: string,
  actor: AuditActor,
  input: z.infer<typeof billLetterheadSchema>,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await lockBusiness(tx, businessId);
    const before = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: LETTERHEAD_SELECT });
    const after = await tx.business.update({
      where: { id: businessId },
      data: {
        ...(input.logoLeftUrl === undefined ? {} : { logoLeftUrl: input.logoLeftUrl || null }),
        ...(input.logoRightUrl === undefined ? {} : { logoRightUrl: input.logoRightUrl || null }),
        ...(input.signatureUrl === undefined ? {} : { signatureUrl: input.signatureUrl || null }),
        billTagline: input.billTagline || null,
        billAccentColor: input.billAccentColor,
      },
      select: LETTERHEAD_SELECT,
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "business.letterhead.update",
      entityType: "Business",
      entityId: businessId,
      before: letterheadAuditView(before),
      after: letterheadAuditView(after),
    });
    return after;
  });
}

export async function listBankAccounts(businessId: string) {
  return db.bankAccount.findMany({
    where: { businessId, isArchived: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

type BankAccountInput = z.infer<typeof bankAccountSchema>;

/** Makes `accountId` the only default (per GST / non-GST) in the business:
 * clears the flag on every other account, auditing each one that changed
 * (these accounts print on bills, so who is "the default" matters). */
async function reassignDefaults(
  tx: Tx,
  businessId: string,
  actor: AuditActor,
  accountId: string,
  flags: { gst: boolean; nonGst: boolean },
) {
  if (!flags.gst && !flags.nonGst) return;
  const others = await tx.bankAccount.findMany({
    where: {
      businessId,
      id: { not: accountId },
      OR: [
        ...(flags.gst ? [{ isDefaultForGst: true }] : []),
        ...(flags.nonGst ? [{ isDefaultForNonGst: true }] : []),
      ],
    },
  });
  for (const other of others) {
    const after = await tx.bankAccount.update({
      where: { id: other.id, businessId },
      data: {
        ...(flags.gst ? { isDefaultForGst: false } : {}),
        ...(flags.nonGst ? { isDefaultForNonGst: false } : {}),
      },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "bank_account.update",
      entityType: "BankAccount",
      entityId: other.id,
      before: other,
      after,
      reason: `Default reassigned to bank account ${accountId}`,
    });
  }
}

export async function addBankAccount(
  businessId: string,
  actor: AuditActor,
  input: BankAccountInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    const account = await tx.bankAccount.create({
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
    await reassignDefaults(tx, businessId, actor, account.id, {
      gst: !!input.isDefaultForGst,
      nonGst: !!input.isDefaultForNonGst,
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "bank_account.create",
      entityType: "BankAccount",
      entityId: account.id,
      after: account,
    });
    return account;
  });
}

/** Edits an existing (non-archived) bank account. Bills already generated keep
 * the bank details they were created with. */
export async function updateBankAccount(
  businessId: string,
  actor: AuditActor,
  id: string,
  input: BankAccountInput,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "BankAccount" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR NO KEY UPDATE`;
    const before = await tx.bankAccount.findFirst({ where: { id, businessId, isArchived: false } });
    if (!before) return fail("NOT_FOUND", "Bank account not found");

    const account = await tx.bankAccount.update({
      where: { id, businessId },
      data: {
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
    await reassignDefaults(tx, businessId, actor, id, {
      gst: !!input.isDefaultForGst,
      nonGst: !!input.isDefaultForNonGst,
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "bank_account.update",
      entityType: "BankAccount",
      entityId: id,
      before,
      after: account,
    });
    return { account } as const;
  });
}

/** Archiving an already-archived account is a no-op success. */
export async function archiveBankAccount(
  businessId: string,
  actor: AuditActor,
  id: string,
  opts?: { tx?: Tx },
) {
  return withTx(opts?.tx, async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "BankAccount" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR NO KEY UPDATE`;
    const before = await tx.bankAccount.findFirst({ where: { id, businessId } });
    if (!before) return fail("NOT_FOUND", "Bank account not found");
    if (before.isArchived) return { account: before } as const;

    const account = await tx.bankAccount.update({
      where: { id, businessId },
      data: { isArchived: true },
    });
    await recordAudit(tx, {
      businessId,
      actor,
      action: "bank_account.archive",
      entityType: "BankAccount",
      entityId: id,
      before,
      after: account,
    });
    return { account } as const;
  });
}
