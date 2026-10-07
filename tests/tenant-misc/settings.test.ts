import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  addBankAccount,
  archiveBankAccount,
  getBusinessSettings,
  getLetterheadImages,
  listBankAccounts,
  regenerateBusinessCode,
  updateBankAccount,
  updateBillLetterhead,
  updateBusinessProfile,
  updateOperatorLanguage,
} from "@/lib/services/settings";
import { cleanupTenant, createTenant, type TestTenant } from "../helpers/tenant";
import { makeJpeg, makePng, toDataUrl } from "./image-fixtures";

/**
 * Settings: every change that ends up on a printed bill or controls who can
 * join the business writes an audit row (same transaction), and nothing can
 * touch another tenant's settings or bank accounts.
 */

let a: TestTenant;
let b: TestTenant;

beforeAll(async () => {
  [a, b] = await Promise.all([createTenant("set-a"), createTenant("set-b")]);
});

afterAll(async () => {
  await Promise.all([a, b].filter(Boolean).map((t) => cleanupTenant(t.businessId)));
});

const audit = (businessId: string, entityType: string, entityId?: string) =>
  db.auditLog.findMany({
    where: { businessId, entityType, ...(entityId ? { entityId } : {}) },
    orderBy: { createdAt: "asc" },
  });

const account = (overrides: Record<string, unknown> = {}) => ({
  label: "Main",
  accountHolderName: "Test Owner",
  accountNumber: "123456789012",
  ifsc: "hdfc0001234",
  bankName: "HDFC Bank",
  ...overrides,
});

describe("bank accounts: audit trail", () => {
  it("create writes an audit row with the full new account (IFSC upper-cased)", async () => {
    const created = await addBankAccount(a.businessId, a.actor, account());
    expect(created.ifsc).toBe("HDFC0001234");

    const rows = await audit(a.businessId, "BankAccount", created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "bank_account.create", actorType: "OWNER", actorId: a.userId });
    expect(rows[0].before).toBeNull();
    expect(rows[0].after).toMatchObject({ label: "Main", ifsc: "HDFC0001234", bankName: "HDFC Bank", isArchived: false });
  });

  it("update writes a before/after audit row", async () => {
    const created = await addBankAccount(a.businessId, a.actor, account({ label: "Before" }));
    const result = await updateBankAccount(a.businessId, a.actor, created.id, account({ label: "After", accountNumber: "999" }));
    if ("error" in result) throw new Error(result.error);
    expect(result.account).toMatchObject({ label: "After", accountNumber: "999" });

    const rows = await audit(a.businessId, "BankAccount", created.id);
    expect(rows.map((r) => r.action)).toEqual(["bank_account.create", "bank_account.update"]);
    expect(rows[1].before).toMatchObject({ label: "Before", accountNumber: "123456789012" });
    expect(rows[1].after).toMatchObject({ label: "After", accountNumber: "999" });
  });

  it("archive writes an audit row, hides the account from the list and is idempotent", async () => {
    const created = await addBankAccount(a.businessId, a.actor, account({ label: "To Archive" }));
    const archived = await archiveBankAccount(a.businessId, a.actor, created.id);
    if ("error" in archived) throw new Error(archived.error);
    expect(archived.account.isArchived).toBe(true);

    expect((await listBankAccounts(a.businessId)).some((x) => x.id === created.id)).toBe(false);
    expect("error" in (await archiveBankAccount(a.businessId, a.actor, created.id))).toBe(false);

    const rows = await audit(a.businessId, "BankAccount", created.id);
    expect(rows.map((r) => r.action)).toEqual(["bank_account.create", "bank_account.archive"]);
    expect(rows[1].before).toMatchObject({ isArchived: false });
    expect(rows[1].after).toMatchObject({ isArchived: true });

    // An archived account can no longer be edited.
    expect(await updateBankAccount(a.businessId, a.actor, created.id, account())).toMatchObject({ code: "NOT_FOUND" });
  });

  it("making an account the default audits the account that lost the flag too", async () => {
    const first = await addBankAccount(a.businessId, a.actor, account({ label: "First", isDefaultForGst: true }));
    const second = await addBankAccount(a.businessId, a.actor, account({ label: "Second", isDefaultForGst: true }));

    const fresh = await db.bankAccount.findMany({ where: { businessId: a.businessId, id: { in: [first.id, second.id] } } });
    expect(fresh.find((x) => x.id === first.id)?.isDefaultForGst).toBe(false);
    expect(fresh.find((x) => x.id === second.id)?.isDefaultForGst).toBe(true);

    const firstRows = await audit(a.businessId, "BankAccount", first.id);
    const demotion = firstRows.find((r) => r.action === "bank_account.update");
    expect(demotion?.before).toMatchObject({ isDefaultForGst: true });
    expect(demotion?.after).toMatchObject({ isDefaultForGst: false });
    expect(demotion?.reason).toContain(second.id);
  });

  it("an unknown id is NOT_FOUND", async () => {
    expect(await updateBankAccount(a.businessId, a.actor, "nope", account())).toMatchObject({ code: "NOT_FOUND" });
    expect(await archiveBankAccount(a.businessId, a.actor, "nope")).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("business profile / operator language / business code: audit trail", () => {
  it("profile update audits before/after (service intervals included) and lists what changed", async () => {
    const before = await getBusinessSettings(a.businessId);
    await updateBusinessProfile(a.businessId, a.actor, {
      name: "Renamed Business",
      ownerName: before.ownerName,
      phone: before.phone,
      address: "12 New Road",
      gstNumber: "27ABCDE1234F1Z5",
      defaultServiceIntervalHrs: 300,
      maintenanceAlertThresholdHrs: 40,
    });

    const after = await getBusinessSettings(a.businessId);
    expect(after).toMatchObject({ name: "Renamed Business", address: "12 New Road", defaultServiceIntervalHrs: 300 });

    const rows = (await audit(a.businessId, "Business")).filter((r) => r.action === "business.profile.update");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityId: a.businessId, actorType: "OWNER", actorId: a.userId });
    expect(rows[0].before).toMatchObject({ name: before.name, defaultServiceIntervalHrs: before.defaultServiceIntervalHrs });
    expect(rows[0].after).toMatchObject({
      name: "Renamed Business",
      address: "12 New Road",
      gstNumber: "27ABCDE1234F1Z5",
      defaultServiceIntervalHrs: 300,
      maintenanceAlertThresholdHrs: 40,
    });
    expect(rows[0].details).toMatchObject({
      changed: expect.arrayContaining(["name", "address", "gstNumber", "defaultServiceIntervalHrs", "maintenanceAlertThresholdHrs"]),
    });
    // Unchanged fields are not listed as changed.
    expect((rows[0].details as { changed: string[] }).changed).not.toContain("ownerName");
  });

  it("operator language change is audited", async () => {
    await updateOperatorLanguage(a.businessId, a.actor, "hi");
    const rows = (await audit(a.businessId, "Business")).filter((r) => r.action === "business.operator_language.update");
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toMatchObject({ operatorLanguage: "en" });
    expect(rows[0].after).toMatchObject({ operatorLanguage: "hi" });
    expect((await getBusinessSettings(a.businessId)).operatorLanguage).toBe("hi");
  });

  it("business code regeneration (random and custom) is audited and refuses a taken code", async () => {
    const original = (await getBusinessSettings(a.businessId)).code;

    const random = await regenerateBusinessCode(a.businessId, a.actor);
    if ("error" in random) throw new Error(random.error);
    expect(random.business.code).not.toBe(original);

    const custom = `TSTCUSTOM${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    const set = await regenerateBusinessCode(a.businessId, a.actor, custom);
    if ("error" in set) throw new Error(set.error);
    expect(set.business.code).toBe(custom.toUpperCase());

    // Tenant B cannot claim A's code.
    const taken = await regenerateBusinessCode(b.businessId, b.actor, custom);
    expect(taken).toMatchObject({ code: "CONFLICT" });
    if ("error" in taken) expect(typeof taken.error).toBe("string");
    expect((await getBusinessSettings(b.businessId)).code).toBe(b.businessCode);

    const rows = (await audit(a.businessId, "Business")).filter((r) => r.action === "business.code.regenerate");
    expect(rows).toHaveLength(2);
    expect(rows[0].before).toEqual({ code: original });
    expect(rows[0].after).toEqual({ code: random.business.code });
    expect(rows[0].details).toMatchObject({ custom: false });
    expect(rows[1].after).toEqual({ code: custom.toUpperCase() });
    expect(rows[1].details).toMatchObject({ custom: true });
    // B's failed attempt wrote nothing.
    expect((await audit(b.businessId, "Business")).filter((r) => r.action === "business.code.regenerate")).toHaveLength(0);
  });
});

describe("letterhead: audit trail, keep / replace / remove", () => {
  const png = toDataUrl("image/png", makePng(40, 20));
  const jpeg = toDataUrl("image/jpeg", makeJpeg(60, 30));
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");

  it("stores images and audits a fingerprint, never the raw image", async () => {
    await updateBillLetterhead(a.businessId, a.actor, {
      logoLeftUrl: png,
      signatureUrl: jpeg,
      billTagline: "Digging deep",
      billAccentColor: "#112233",
    });
    expect(await getLetterheadImages(a.businessId)).toEqual({ logoLeftUrl: png, logoRightUrl: null, signatureUrl: jpeg });

    const rows = (await audit(a.businessId, "Business")).filter((r) => r.action === "business.letterhead.update");
    expect(rows).toHaveLength(1);
    const after = rows[0].after as Record<string, unknown>;
    expect(after.logoLeft).toEqual({ length: png.length, sha256: sha(png) });
    expect(after.logoRight).toBeNull();
    expect(after.signature).toEqual({ length: jpeg.length, sha256: sha(jpeg) });
    expect(after).toMatchObject({ billTagline: "Digging deep", billAccentColor: "#112233" });
    // The (append-only) trail must not carry the image bytes themselves.
    expect(JSON.stringify(rows[0])).not.toContain(png.slice(30, 80));
  });

  it("an omitted image keeps the stored one; \"\" removes it", async () => {
    await updateBillLetterhead(a.businessId, a.actor, { billTagline: "Only text changed", billAccentColor: "#112233" });
    expect(await getLetterheadImages(a.businessId)).toEqual({ logoLeftUrl: png, logoRightUrl: null, signatureUrl: jpeg });

    await updateBillLetterhead(a.businessId, a.actor, { signatureUrl: "", billAccentColor: "#112233" });
    expect(await getLetterheadImages(a.businessId)).toEqual({ logoLeftUrl: png, logoRightUrl: null, signatureUrl: null });

    const rows = (await audit(a.businessId, "Business")).filter((r) => r.action === "business.letterhead.update");
    expect(rows).toHaveLength(3);
    expect((rows[2].before as Record<string, unknown>).signature).toEqual({ length: jpeg.length, sha256: sha(jpeg) });
    expect((rows[2].after as Record<string, unknown>).signature).toBeNull();
  });

  it("existing bills keep their frozen letterhead", async () => {
    const customer = await db.customer.findFirstOrThrow({ where: { businessId: a.businessId } });
    const frozen = { logoLeftUrl: "data:image/png;base64,FROZEN", businessName: "Old Name" };
    const bill = await db.bill.create({
      data: {
        businessId: a.businessId,
        billNumber: `TST-FROZEN-${Date.now()}`,
        billType: "GST",
        customerId: customer.id,
        billDate: new Date(),
        subtotal: "1.00",
        totalAmount: "1.00",
        letterhead: frozen,
      },
    });
    await updateBillLetterhead(a.businessId, a.actor, { logoLeftUrl: "", billAccentColor: "#445566" });
    const after = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(after.letterhead).toEqual(frozen);
  });
});

describe("settings: tenant isolation", () => {
  let aAccountId: string;

  beforeAll(async () => {
    const created = await addBankAccount(a.businessId, a.actor, account({ label: "A Secret Account", accountNumber: "A-ONLY-1" }));
    aAccountId = created.id;
  });

  it("tenant B cannot list, update or archive tenant A's bank account", async () => {
    expect((await listBankAccounts(b.businessId)).some((x) => x.id === aAccountId)).toBe(false);

    expect(await updateBankAccount(b.businessId, b.actor, aAccountId, account({ label: "Hijacked" }))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await archiveBankAccount(b.businessId, b.actor, aAccountId)).toMatchObject({ code: "NOT_FOUND" });

    const row = await db.bankAccount.findUniqueOrThrow({ where: { id: aAccountId } });
    expect(row).toMatchObject({ label: "A Secret Account", isArchived: false, businessId: a.businessId });
    expect(await audit(b.businessId, "BankAccount", aAccountId)).toHaveLength(0);
  });

  it("making a bank account the default in tenant B never clears tenant A's default", async () => {
    const aDefault = await addBankAccount(a.businessId, a.actor, account({ label: "A Default", isDefaultForGst: true, isDefaultForNonGst: true }));
    await addBankAccount(b.businessId, b.actor, account({ label: "B Default", isDefaultForGst: true, isDefaultForNonGst: true }));

    const row = await db.bankAccount.findUniqueOrThrow({ where: { id: aDefault.id } });
    expect(row).toMatchObject({ isDefaultForGst: true, isDefaultForNonGst: true });
  });

  it("settings reads and writes only ever touch the caller's own business", async () => {
    const aBefore = await getBusinessSettings(a.businessId);
    await updateBusinessProfile(b.businessId, b.actor, {
      name: "B Rename",
      ownerName: "B Owner",
      phone: "9000000009",
      defaultServiceIntervalHrs: 111,
      maintenanceAlertThresholdHrs: 11,
    });
    await updateOperatorLanguage(b.businessId, b.actor, "mr");
    await updateBillLetterhead(b.businessId, b.actor, { signatureUrl: toDataUrl("image/png", makePng()), billAccentColor: "#ABCDEF" });

    const aAfter = await getBusinessSettings(a.businessId);
    expect(aAfter).toEqual(aBefore);
    expect((await getBusinessSettings(b.businessId)).name).toBe("B Rename");

    // Audit rows land in the caller's own business only.
    expect((await audit(a.businessId, "Business")).some((r) => (r.after as { name?: string } | null)?.name === "B Rename")).toBe(false);
    expect((await audit(b.businessId, "Business")).length).toBeGreaterThanOrEqual(3);
  });
});
