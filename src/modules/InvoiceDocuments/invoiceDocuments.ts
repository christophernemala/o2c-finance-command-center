import type { FinanceRow, InvoiceDocument, PaymentProofAudit, ReconciliationResult } from "../../shared/types";

export function buildInvoiceDocuments(rows: FinanceRow[]): InvoiceDocument[] {
  return rows.slice(0, 60).map((row, index) => ({
    invoiceNumber: row.invoiceNumber,
    customerNumber: row.customerNumber,
    customerName: row.customerName,
    amount: row.amount,
    currency: "AED",
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    pdfFileName: `${row.invoiceNumber}-${row.customerNumber}.pdf`,
    exportStatus: index < 20 ? "Exported" : "Ready",
    importStatus: index < 12 ? "Verified" : index < 18 ? "Pending" : "Rejected",
    agentAction: index < 12 ? "PDF exported, imported, and matched to invoice register." : index < 20 ? "PDF exported and waiting for import proof." : "Ready for offline invoice PDF export."
  }));
}

export function buildPaymentProofAudit(reconciliation: ReconciliationResult[]): PaymentProofAudit[] {
  return reconciliation.slice(0, 160).map((row, index) => {
    const matched = row.matchStatus === "Matched";
    const suggested = row.matchStatus === "Suggested";
    return {
      bankReference: row.bankReference,
      invoiceNumber: row.invoiceNumber,
      customerNumber: row.customerNumber,
      customerName: row.customerName,
      paymentAmount: row.amount,
      currency: "AED",
      proofType: index % 4 === 0 ? "Bank Statement" : index % 4 === 1 ? "Receipt Advice" : index % 4 === 2 ? "Remittance Email" : "Manual Upload",
      proofFileName: `proof-${row.bankReference}-${row.invoiceNumber}.pdf`,
      auditStatus: matched ? "Matched" : suggested ? "Needs Review" : "Rejected",
      reviewedBy: matched ? "bank.recon.agent" : "collector.review",
      reviewedAt: "2026-06-13T10:30:00.000Z",
      auditNote: matched ? "Bank reference, invoice, and AED amount matched." : row.exceptionReason ?? "Variance requires payment-proof review."
    };
  });
}

export function renderInvoicePdfText(row: InvoiceDocument) {
  return [
    "O2C FINANCE COMMAND CENTER",
    "DUMMY TAX INVOICE",
    `Invoice Number: ${row.invoiceNumber}`,
    `Customer Account: ${row.customerNumber}`,
    `Customer Name: ${row.customerName}`,
    `Invoice Date: ${row.invoiceDate}`,
    `Due Date: ${row.dueDate}`,
    `Amount: AED ${row.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    "Generated offline for invoice export/import workflow testing."
  ];
}
