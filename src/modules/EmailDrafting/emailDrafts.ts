import type { EmailDraft, FinanceRow } from "../../shared/types";

export function draftSoaEmail(customerRows: FinanceRow[]): EmailDraft {
  if (customerRows.length === 0) throw new Error("Cannot draft SOA email without customer rows.");
  const first = customerRows[0];
  const outstanding = customerRows.reduce((total, row) => total + row.outstandingAmount, 0);
  const invoices = customerRows.map((row) => row.invoiceNumber).slice(0, 8).join(", ");
  return {
    customerName: first.customerName,
    customerNumber: first.customerNumber,
    to: first.customerEmail,
    subject: `Statement of Account review | ${first.customerName}`,
    attachmentName: `SOA-${first.customerNumber}.xlsx`,
    body: [
      `Dear ${first.customerName} team,`,
      "",
      `Please find attached the latest statement of account for ${first.customerNumber}. Our current records show AED ${outstanding.toLocaleString("en-US", { maximumFractionDigits: 2 })} outstanding across invoices ${invoices}.`,
      "",
      "Kindly review the attached SOA and share payment status, remittance advice, or dispute details where applicable.",
      "",
      "Regards,",
      "O2C Finance Command Center"
    ].join("\n")
  };
}
