import type { AuditComment, FinanceRow, InvoiceStatus } from "../../shared/types";

export function appendComment(row: FinanceRow, text: string, user = "collector.lead"): FinanceRow {
  const comment: AuditComment = { at: new Date().toISOString(), user, text };
  return { ...row, comments: [...row.comments, comment] };
}

export function transitionInvoice(row: FinanceRow, nextStatus: InvoiceStatus, user = "ar.manager"): FinanceRow {
  const allowed: Record<InvoiceStatus, InvoiceStatus[]> = {
    Open: ["Partially Applied", "Closed", "Disputed", "Promise To Pay", "Write Off Review"],
    "Partially Applied": ["Closed", "Disputed", "Promise To Pay", "Write Off Review"],
    Closed: ["Open"],
    Disputed: ["Open", "Closed", "Write Off Review"],
    "Promise To Pay": ["Open", "Partially Applied", "Closed"],
    "Write Off Review": ["Closed", "Open"]
  };
  if (!allowed[row.status].includes(nextStatus)) {
    throw new Error(`Invalid AR transition from ${row.status} to ${nextStatus}`);
  }
  return appendComment({ ...row, status: nextStatus }, `Status changed from ${row.status} to ${nextStatus}.`, user);
}

export function closeInvoice(row: FinanceRow, user = "ar.manager"): FinanceRow {
  return transitionInvoice({ ...row, outstandingAmount: 0, paidAmount: row.amount, appliedAmount: row.amount }, "Closed", user);
}
