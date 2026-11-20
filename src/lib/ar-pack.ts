import Decimal from "decimal.js";
import { aggregateAmount } from "./money";
import type { Breakdown, BreakdownDimension } from "@/types/collections";
const CloseDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
function sumAmounts(values: string[]) { return values.reduce((total, value) => total.plus(aggregateAmount(value)), new CloseDecimal(0)).toFixed(2); }
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

/** Validate database-provided grouping rows before they enter an exported workbook. */
export function validateCloseBreakdown(value: unknown, dimension: BreakdownDimension, asOf: string): Breakdown {
  if (!value || typeof value !== "object") throw new Error("Invalid close breakdown");
  const raw = value as Record<string, unknown>;
  if (raw.dimension !== dimension || raw.as_of !== asOf || !raw.total || typeof raw.total !== "object" || !Array.isArray(raw.rows) || raw.rows.length > 10_000) throw new Error("Invalid close breakdown");
  const validateAmounts = (entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid close amount row");
    const row = entry as Record<string, unknown>;
    for (const key of ["open", "current", "d1_30", "d31_60", "d61_90", "d90_plus", "disputed"] as const) aggregateAmount(row[key]);
  };
  validateAmounts(raw.total);
  const count = (input: unknown) => { if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) throw new Error("Invalid close count"); return input; };
  const total = raw.total as Record<string, unknown>;
  count(total.customers); count(total.invoices);
  const rows = raw.rows.map(entry => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid close grouping row");
    const row = entry as Record<string, unknown>; validateAmounts(row);
    if (typeof row.label !== "string" || row.label.length > 300 || row.label.trim() !== row.label
      || !(row.account === null || typeof row.account === "string") || !(row.customer_id === null || typeof row.customer_id === "string")
      || !(row.share_percent === null || (typeof row.share_percent === "string" && /^\d{1,3}(?:\.\d{1,2})?$/.test(row.share_percent)))) throw new Error("Invalid close grouping row");
    return { label: row.label, account: row.account as string | null, customer_id: row.customer_id as string | null,
      customers: count(row.customers), invoices: count(row.invoices), open: aggregateAmount(row.open), current: aggregateAmount(row.current),
      d1_30: aggregateAmount(row.d1_30), d31_60: aggregateAmount(row.d31_60), d61_90: aggregateAmount(row.d61_90),
      d90_plus: aggregateAmount(row.d90_plus), disputed: aggregateAmount(row.disputed), share_percent: row.share_percent as string | null };
  });
  return { dimension, as_of: asOf, category: typeof raw.category === "string" ? raw.category : null,
    region: typeof raw.region === "string" ? raw.region : null,
    total: { customers: count(total.customers), invoices: count(total.invoices), open: aggregateAmount(total.open), current: aggregateAmount(total.current),
      d1_30: aggregateAmount(total.d1_30), d31_60: aggregateAmount(total.d31_60), d61_90: aggregateAmount(total.d61_90),
      d90_plus: aggregateAmount(total.d90_plus), disputed: aggregateAmount(total.disputed) }, rows };
}

/** Source-backed month-end support pack; all values are pre-aggregated from authenticated ledger reports. */
export function monthEndWorkbook(pack: ArPack, entityName: string, category: Breakdown, region: Breakdown, retrievedAt: string) {
  if (category.dimension !== "category" || region.dimension !== "region" || category.as_of !== pack.as_of || region.as_of !== pack.as_of) throw new Error("Close report scope mismatch");
  const pivotRows = (breakdown: Breakdown) => breakdown.rows.map(row => ({
    [breakdown.dimension === "category" ? "Customer category" : "Customer region"]: row.label,
    Customers: String(row.customers), Invoices: String(row.invoices), "Open AED": row.open, "Current AED": row.current,
    "1–30 days AED": row.d1_30, "31–60 days AED": row.d31_60, "61–90 days AED": row.d61_90,
    "90+ days AED": row.d90_plus, "Disputed AED": row.disputed, "Share of open AR (%)": row.share_percent ?? "0.00",
  }));
  const agingSum = sumAmounts(pack.aging.map(row => row.amount));
  const categoriesSum = sumAmounts(category.rows.map(row => row.open));
  const regionsSum = sumAmounts(region.rows.map(row => row.open));
  const sourceTotal = aggregateAmount(pack.open_ar);
  const tieOut = (control: string, value: string) => { const analysisTotal = aggregateAmount(value); return { Control: control, "Source total AED": sourceTotal, "Analysis total AED": analysisTotal,
    "Difference AED": new CloseDecimal(analysisTotal).minus(sourceTotal).toFixed(2), Status: analysisTotal === sourceTotal ? "Ties" : "Investigate" }; };
  return {
    "Close summary": [
      { Item: "Report", Value: "Month-end AR close support and management analysis" },
      { Item: "Legal entity", Value: entityName }, { Item: "Currency", Value: "AED" },
      { Item: "Selected aging date", Value: pack.as_of }, { Item: "Retrieved at (UTC)", Value: retrievedAt },
      { Item: "Report basis", Value: "Current ledger balances re-aged at the selected date. This is not a historical balance reconstruction, GL close, or accounting posting." },
      { Item: "Open AR (AED)", Value: pack.open_ar }, { Item: "Overdue AR (AED)", Value: pack.overdue_ar },
      { Item: "Disputed AR (AED)", Value: pack.disputed_ar }, { Item: "Unapplied cash (AED)", Value: pack.unapplied_cash },
      { Item: "Open invoices", Value: String(pack.open_invoice_count) }, { Item: "Customers with balance", Value: String(pack.customer_count) },
      { Item: "DSO, countback (days)", Value: pack.dso_countback_days ?? "Insufficient history" },
      { Item: "CEI, 30 days (%)", Value: pack.cei_30d_percent ?? "Unavailable" },
      { Item: "Pivot sheets", Value: "AR aging; customer category; customer region; top debtors (top 10 only)" },
    ],
    "AR aging pivot": pack.aging.map(row => ({ "Aging bucket": row.bucket, "Open AED": row.amount, Invoices: String(row.invoices), "Aging date": pack.as_of })),
    "Category pivot": pivotRows(category), "Region pivot": pivotRows(region),
    "Top debtor concentration": pack.top_debtors.map(row => ({ Customer: row.customer, Account: row.account, "Open AED": row.open,
      "Overdue AED": row.overdue ?? "0.00", "Oldest due": row.oldest_due ?? "", Invoices: String(row.invoices), Scope: "Top 10 only" })),
    "Close tie-out checks": [tieOut("Aging buckets vs open AR", agingSum), tieOut("Category pivot vs open AR", categoriesSum), tieOut("Region pivot vs open AR", regionsSum)],
    "KPI basis": [
      { Item: "DSO method", Value: pack.dso_basis }, { Item: "CEI period", Value: `${pack.cei_basis.period_start} to ${pack.cei_basis.period_end}` },
      { Item: "Beginning AR (AED)", Value: pack.cei_basis.beginning_ar }, { Item: "Credit sales (AED)", Value: pack.cei_basis.credit_sales },
      { Item: "Debit notes issued (AED)", Value: pack.cei_basis.debit_notes }, { Item: "Credit notes posted (AED)", Value: pack.cei_basis.credit_notes },
      { Item: "Ending AR (AED)", Value: pack.cei_basis.ending_ar }, { Item: "Ending current AR (AED)", Value: pack.cei_basis.ending_current_ar },
      { Item: "Interpretation", Value: "DSO and CEI are only available when their governed history and reporting bases are present. Review KPI basis before relying on either figure." },
    ],
  };
}
