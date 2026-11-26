export type SourceFormat = "CSV" | "XLSX";
export type SourceHandling = "review-and-stage" | "browser-analysis-only" | "conversation-only";

/**
 * Explicit registry of implemented file paths. Adding an entry does not create a
 * live ERP/bank connector; any new adapter must also add validation, tests and
 * (where applicable) an authorized server-side commit path.
 */
export interface SourceAdapter {
  id: string;
  label: string;
  formats: readonly SourceFormat[];
  headers: readonly string[] | null;
  handling: SourceHandling;
  disclosure: string;
  importKind?: "invoices" | "bank_lines";
}

export const eclDetailHeaders = [
  "account", "customer", "exposure", "pd_percent", "lgd_percent",
  "source_provision", "currency", "source_reference",
] as const;

export const sourceAdapters: readonly SourceAdapter[] = [
  {
    id: "open-invoices",
    label: "Open invoices",
    formats: ["CSV", "XLSX"],
    headers: ["number", "account", "customer", "issued_at", "due_date", "amount", "currency"],
    handling: "review-and-stage",
    disclosure: "Entirely unpaid AED invoices; staged and committed only after an independent checker review.",
    importKind: "invoices",
  },
  {
    id: "bank-statement-lines",
    label: "Bank statement lines",
    formats: ["CSV", "XLSX"],
    headers: ["reference", "booked_at", "direction", "amount", "currency"],
    handling: "review-and-stage",
    disclosure: "AED credits and debits; staged and committed only after an independent checker review.",
    importKind: "bank_lines",
  },
  {
    id: "customer-ecl-detail",
    label: "Customer-level ECL detail",
    formats: ["CSV", "XLSX"],
    headers: eclDetailHeaders,
    handling: "browser-analysis-only",
    disclosure: "A local arithmetic cross-check from supplied EAD, PD, LGD and source provision values; it is not saved or posted and is not an IFRS 9 model.",
  },
  {
    id: "copilot-table-analysis",
    label: "Copilot table analysis",
    formats: ["CSV", "XLSX"],
    headers: null,
    handling: "conversation-only",
    disclosure: "A read-only, scoped conversation can inspect a bounded user-provided table with its own headers; it does not import the table into the ledger.",
  },
] as const;

export function sourceAdapter(id: string): SourceAdapter | undefined {
  return sourceAdapters.find(adapter => adapter.id === id);
}
