"use client";

import { BillHeader } from "./editor/bill-header";
import { BillItemsSection } from "./editor/bill-items-section";
import { BillSummary } from "./editor/bill-summary";
import { DirectBillFields } from "./editor/direct-bill-fields";
import { ExtraCharges } from "./editor/extra-charges";
import { SiteSuggestions } from "./editor/form-parts";
import { QuickFill } from "./editor/quick-fill";
import { SubmitBar } from "./editor/submit-bar";
import { TaxSection } from "./editor/tax-section";
import type { BillFormInitial, BillFormOptions } from "./editor/types";
import { useBillEditor } from "./editor/use-bill-editor";

export type { BillFormInitial, BillFormOptions };

/** One form for both "Summary Bill" creation and editing any existing bill
 * (normal/summary bills are an Excel-like grid of rows; direct bills have their
 * own fields). All state and rules live in useBillEditor; this only lays the
 * sections out. The grid is built for speed: Quick Fill generates a whole date
 * range for several machines at once, Enter moves down a column (adding a copied
 * row at the end), pasting a column from Excel fills downward, and
 * rate/site/dates carry over from the row above. Below `md` the grid becomes a
 * stack of cards. */
export function BillEditorForm({
  options,
  mode,
  billId,
  isDirect = false,
  initial,
  onReloadLatest,
}: {
  options: BillFormOptions;
  mode: "create" | "edit";
  billId?: string;
  isDirect?: boolean;
  initial?: BillFormInitial;
  /** Edit mode: re-fetch the bill and restart the form from it (offered after a conflict). */
  onReloadLatest?: () => void;
}) {
  const editor = useBillEditor({ options, mode, billId, isDirect, initial });
  const { fields, setField } = editor;

  return (
    <form onSubmit={editor.onSubmit} className="flex flex-col gap-4">
      <BillHeader
        customers={options.customers}
        customerId={fields.customerId}
        billDate={fields.billDate}
        onCustomerChange={(id) => setField("customerId", id)}
        onDateChange={(date) => setField("billDate", date)}
      />

      {isDirect ? (
        <DirectBillFields
          excavators={options.excavators}
          direct={editor.direct}
          transport={fields.transport}
          onChange={editor.setDirectField}
          onTransportChange={(v) => setField("transport", v)}
        />
      ) : (
        <>
          <SiteSuggestions sites={options.sites} />
          <QuickFill excavators={options.excavators} onAdd={editor.addQuickFillRows} />
          <BillItemsSection
            rows={editor.rows}
            excavators={options.excavators}
            totals={editor.totals}
            ops={editor.rowOps}
            gridRef={editor.gridRef}
          />
          <ExtraCharges fields={fields} legacy={editor.legacyCharges} onChange={(key, v) => setField(key, v)} />
        </>
      )}

      <TaxSection
        mode={mode}
        options={options}
        fields={fields}
        onChange={setField}
        onBillTypeChange={editor.setBillType}
      />
      <BillSummary
        totals={editor.totals}
        isDirect={isDirect}
        billType={fields.billType}
        gstPercentage={fields.gstPercentage}
      />
      <SubmitBar
        mode={mode}
        pending={editor.pending}
        blocker={editor.blocker}
        error={editor.error}
        conflict={editor.conflict}
        onReloadLatest={onReloadLatest}
        total={editor.totals.total}
      />
    </form>
  );
}
