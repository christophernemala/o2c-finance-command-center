import type { Approval } from "@/types/workspace";
import { amount, subtractAmounts } from "./money";

/** Controls require readable, matching source records; posting rechecks under locks. */
export function approvalEvidenceCurrent(row: Approval): boolean {
  const source = row.source_records; const captured = row.captured_versions;
  if (!source || !captured || !source.customer || !source.bank_line) return false;
  const bank = source.bank_line;
  if (bank.direction !== "credit") return false;
  if (row.kind === "receipt") return source.customer.id === row.customer_id
    && bank.id === row.bank_line_id && bank.version === captured.bank_line && amount(bank.amount) === amount(row.amount);
  const invoice = source.invoice; const receipt = source.receipt;
  return !!invoice && !!receipt && invoice.id === row.invoice_id && receipt.id === row.receipt_id
    && invoice.customer_id === source.customer.id && receipt.customer_id === source.customer.id
    && invoice.lifecycle === "posted" && invoice.version === captured.invoice && receipt.version === captured.receipt
    && !subtractAmounts(invoice.open, row.amount).startsWith("-") && !subtractAmounts(receipt.residual, row.amount).startsWith("-");
}
