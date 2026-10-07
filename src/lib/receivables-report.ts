import type { Snapshot } from "../types/workspace";
import { addAmounts, agingBucket } from "./money";

/** Reporting preserves the authenticated snapshot and its pagination boundary. */
export function receivablesReport(data: Snapshot) {
  const aging = data.insights.charts.find(chart => chart.key === "aging");
  if (!aging || aging.unit !== "AED") throw new Error("Verified aging totals are unavailable.");
  const invoices = data.invoices.map(row => ({
    Invoice: row.number, Customer: row.customer, "Customer ID": row.customer_id,
    "Gross AED": row.gross, "Open AED": row.open, "Due date": row.due_date,
    "Aging bucket": agingBucket(row.due_date, data.as_of),
    Lifecycle: row.lifecycle, Settlement: row.settlement, Dispute: row.dispute,
    Collection: row.collection, "Record ID": row.id,
  }));
  return {
    "Report scope": [{
      Tenant: data.tenant_id, Entity: data.entity_id, Currency: "AED",
      "Retrieved at": data.fetched_at, "Aging date": data.as_of,
      "Report basis": "Current balances aged at the reporting date; not a historical balance reconstruction",
      "Invoice detail scope": "First 50 invoice records only",
      "Invoice rows exported": data.invoices.length, "All invoice records": data.totals.invoice_count,
      "Gross AED all invoices": data.totals.gross, "Open AED all invoices": data.totals.open,
      "Overdue AED all invoices": data.totals.overdue, "Unapplied AED": data.totals.unapplied,
      "Gross AED exported rows": addAmounts(data.invoices.map(row => row.gross)),
      "Open AED exported rows": addAmounts(data.invoices.map(row => row.open)),
      "Customer scope": "Customer directory supplied by the authenticated entity snapshot",
      "Invoice documents": "Source invoice PDFs are not included; this is a receivables register",
      "Amount format": "Exact AED decimal strings; stored as Excel text to preserve precision",
    }],
    "Entity aging totals": aging.series.map(row => ({
      "Aging bucket": row.label, "Open AED": row.value,
      "Aging date": data.as_of, Scope: "All posted open invoices in the selected entity",
    })),
    "Invoice detail page 1": invoices,
    "Customer directory": data.customers.map(row => ({
      Customer: row.name, "Account reference": row.account, "Customer ID": row.id,
      Tenant: data.tenant_id, Entity: data.entity_id,
    })),
  };
}
