import { aggregateAmount } from "./money";
export interface ArPack {
  as_of: string; open_ar: string; overdue_ar: string; disputed_ar: string; unapplied_cash: string;
  open_invoice_count: number; customer_count: number; unposted_bank_credits: number; pending_approvals: number;
  aging: { bucket: string; amount: string; invoices: number }[];
  top_debtors: { customer: string; account: string; open: string; overdue: string | null; oldest_due: string | null; invoices: number }[];
  dso_countback_days: string | null; dso_basis: string; cei_30d_percent: string | null;
  cei_basis: { period_start: string; period_end: string; beginning_ar: string; credit_sales: string; debit_notes: string; credit_notes: string; ending_ar: string; ending_current_ar: string };
}
/** Validate the database pack at the boundary; money stays as decimal strings. */
export function validateArPack(value: unknown): ArPack {
  const pack = value as ArPack;
  if (!pack || typeof pack !== "object" || !Array.isArray(pack.aging) || !Array.isArray(pack.top_debtors) || !pack.cei_basis) throw new Error("Invalid AR pack");
  for (const key of ["open_ar", "overdue_ar", "disputed_ar", "unapplied_cash"] as const) aggregateAmount(pack[key]);
  pack.aging.forEach(row => aggregateAmount(row.amount)); pack.top_debtors.forEach(row => { aggregateAmount(row.open); if (row.overdue !== null) aggregateAmount(row.overdue); });
  if (pack.dso_countback_days !== null && !/^\d+(\.\d{1,2})?$/.test(pack.dso_countback_days)) throw new Error("Invalid DSO");
  if (pack.cei_30d_percent !== null && !/^-?\d+(\.\d{1,2})?$/.test(pack.cei_30d_percent)) throw new Error("Invalid CEI");
  return pack;
}
export function arPackWorkbook(pack: ArPack, entityName: string): Record<string, Record<string, unknown>[]> {
  return {
    Summary: [
      { Metric: "Legal entity", Value: entityName }, { Metric: "As of (Asia/Dubai)", Value: pack.as_of },
      { Metric: "Open AR (AED)", Value: pack.open_ar }, { Metric: "Overdue AR (AED)", Value: pack.overdue_ar },
      { Metric: "Disputed AR (AED)", Value: pack.disputed_ar }, { Metric: "Unapplied cash (AED)", Value: pack.unapplied_cash },
      { Metric: "DSO, countback (days)", Value: pack.dso_countback_days ?? "Insufficient history" },
      { Metric: "CEI, 30 days (%)", Value: pack.cei_30d_percent ?? "Unavailable" },
      { Metric: "Open invoices", Value: String(pack.open_invoice_count) }, { Metric: "Customers with balance", Value: String(pack.customer_count) },
      { Metric: "Unposted bank credits", Value: String(pack.unposted_bank_credits) }, { Metric: "Pending approvals", Value: String(pack.pending_approvals) },
    ],
    Aging: pack.aging.map(row => ({ "Days past due": row.bucket, "Open AED": row.amount, Invoices: String(row.invoices) })),
    "Top debtors": pack.top_debtors.map(row => ({ Customer: row.customer, Account: row.account, "Open AED": row.open, "Overdue AED": row.overdue ?? "0.00", "Oldest due": row.oldest_due ?? "", Invoices: String(row.invoices) })),
    "KPI basis": [
      { Item: "DSO method", Value: pack.dso_basis },
      { Item: "CEI period", Value: `${pack.cei_basis.period_start} to ${pack.cei_basis.period_end}` },
      { Item: "Beginning AR (AED)", Value: pack.cei_basis.beginning_ar }, { Item: "Credit sales (AED)", Value: pack.cei_basis.credit_sales },
      { Item: "Debit notes issued (AED)", Value: pack.cei_basis.debit_notes }, { Item: "Credit notes posted (AED)", Value: pack.cei_basis.credit_notes },
      { Item: "Ending AR (AED)", Value: pack.cei_basis.ending_ar }, { Item: "Ending current AR (AED)", Value: pack.cei_basis.ending_current_ar },
      { Item: "CEI formula", Value: "(Beginning AR + Credit sales + Debit notes - Credit notes - Ending AR) / (Beginning AR + Credit sales + Debit notes - Credit notes - Ending current AR) x 100. Credit notes are not collections; debit notes are not credit sales." },
    ],
  };
}
