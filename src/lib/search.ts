import { amount } from "./money";
export interface InvoiceSearchMatch { id: string; number: string; customer: string; account: string; due_date: string; open: string; days_overdue: number; dispute: string; collection: string }
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => date.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
/** Validate the scoped invoice RPC before it reaches the UI or a JSON search response. */
export function validateInvoiceMatches(value: unknown): InvoiceSearchMatch[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid invoice search results");
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("Invalid invoice search row");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !uuid.test(row.id) || typeof row.number !== "string" || row.number.length > 200
      || typeof row.customer !== "string" || row.customer.length > 300 || typeof row.account !== "string" || row.account.length > 100
      || typeof row.due_date !== "string" || !validDate(row.due_date) || typeof row.days_overdue !== "number" || !Number.isSafeInteger(row.days_overdue)
      || typeof row.dispute !== "string" || typeof row.collection !== "string") throw new Error("Invalid invoice search row");
    return { id: row.id, number: row.number, customer: row.customer, account: row.account, due_date: row.due_date,
      open: amount(row.open), days_overdue: row.days_overdue, dispute: row.dispute, collection: row.collection };
  });
}
