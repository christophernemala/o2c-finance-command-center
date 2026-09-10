import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLocalFinanceModel } from "../src/data/financeModel";
import { eclMatrixRows } from "../src/modules/ECLProvision/ecl";
import { draftSoaEmail } from "../src/modules/EmailDrafting/emailDrafts";
import { exportWorkbook } from "../src/modules/DashboardRenderer/excel";
import { renderInvoicePdfText } from "../src/modules/InvoiceDocuments/invoiceDocuments";

const outDir = resolve("reports");
const invoicePdfDir = resolve(outDir, "dummy-invoices");
mkdirSync(outDir, { recursive: true });
mkdirSync(invoicePdfDir, { recursive: true });
const model = buildLocalFinanceModel();
const customerRows = model.rows.filter((row) => row.customerNumber === model.rows[0].customerNumber);
const emailDraft = draftSoaEmail(customerRows);
const agingTemplate = [{
  transactionDescription: "Retail O2C receivable INV-202600001",
  transactionNumber: "TRX-700001",
  glDate: "2026-06-13",
  glAccount: "1100-AR-Trade",
  appliedAmount: 0,
  paymentDate: "",
  paymentReference: "",
  customerName: "Northstar Trading",
  customerNumber: "CUST-00001",
  customerEmail: "ar.cust-00001@example.local",
  bankReference: "BNK-501001",
  invoiceNumber: "INV-202600001",
  invoiceDate: "2026-04-01",
  dueDate: "2026-05-01",
  amount: 125000,
  paidAmount: 0,
  outstandingAmount: 125000,
  businessUnit: "Retail",
  daysPastDue: 43,
  normalAgingBucket: "31-60",
  eclBucket: "31-60",
  provisionRate: 0.025,
  comments: "Collector note or dispute update"
}];
const bankTemplate = [{
  bankAccount: "O2C-Main-Operating-001",
  statementDate: "2026-06-13",
  bankReference: "BNK-501001",
  invoiceNumber: "INV-202600001",
  customerName: "Northstar Trading",
  customerNumber: "CUST-00001",
  amount: 125000,
  currency: "AED",
  transactionDescription: "Incoming transfer INV-202600001",
  valueDate: "2026-06-13",
  debitCredit: "Credit",
  matchStatus: "To be matched",
  comments: "Optional bank memo"
}];
const detailedAgingReport = model.rows.map((row) => ({
  "Customer Account Number": row.customerNumber,
  "Customer Name": row.customerName,
  "Transaction Description": row.transactionDescription,
  "Transaction Number": row.transactionNumber,
  "Invoice Number": row.invoiceNumber,
  "GL Date": row.glDate,
  "GL Account": row.glAccount,
  "Invoice Date": row.invoiceDate,
  "Due Date": row.dueDate,
  "Amount AED": row.amount,
  "Applied Amount AED": row.appliedAmount,
  "Paid Amount AED": row.paidAmount,
  "Outstanding AED": row.outstandingAmount,
  "Days Past Due": row.daysPastDue,
  "Aging Bucket": row.agingBucket,
  Comments: row.comments.at(-1)?.text ?? "",
  "Payment Date": row.paymentDate ?? "",
  "Payment Reference": row.paymentReference ?? "",
  "Bank Reference": row.bankReference,
  Status: row.status
}));
const ifrs9EclReport = model.rows.map((row) => ({
  "Customer Account Number": row.customerNumber,
  "Customer Name": row.customerName,
  "Invoice Number": row.invoiceNumber,
  "Transaction Description": row.transactionDescription,
  "Outstanding AED": row.outstandingAmount,
  "Days Past Due": row.daysPastDue,
  "ECL Bucket": row.eclBucket,
  "Provision Rate": row.provisionRate,
  "Provision AED": row.provisionAmount,
  "IFRS 9 Note": row.daysPastDue > 180 ? "180+ days: 100% ECL provision" : "IFRS 9 provision matrix bucket"
}));
const totalDataMatrix = model.rows.map((row) => ({
  "Customer Account Number": row.customerNumber,
  "Customer Name": row.customerName,
  "Customer Email": row.customerEmail,
  "Business Unit": row.businessUnit,
  Entity: row.entity,
  "Transaction Description": row.transactionDescription,
  "Transaction Number": row.transactionNumber,
  "Invoice Number": row.invoiceNumber,
  "Invoice Date": row.invoiceDate,
  "Due Date": row.dueDate,
  "GL Date": row.glDate,
  "GL Account": row.glAccount,
  "Bank Reference": row.bankReference,
  "Payment Date": row.paymentDate ?? "",
  "Payment Reference": row.paymentReference ?? "",
  Currency: row.currency,
  "Amount AED": row.amount,
  "Applied Amount AED": row.appliedAmount,
  "Paid Amount AED": row.paidAmount,
  "Outstanding AED": row.outstandingAmount,
  "Unapplied Amount AED": Math.max(0, row.amount - row.appliedAmount),
  "Received Amount AED": row.receivedAmount,
  "Days Past Due": row.daysPastDue,
  "Aging Bucket": row.agingBucket,
  "ECL Bucket": row.eclBucket,
  "Provision Rate": row.provisionRate,
  "Provision AED": row.provisionAmount,
  Status: row.status,
  "Cheque Expiry Date": row.chequeExpiryDate,
  "Trade License Expiry Date": row.tradeLicenseExpiryDate,
  "SLA Email Source": row.slaEmailSource,
  Comments: row.comments.at(-1)?.text ?? ""
}));
const riskAccounts = buildRiskAccountRows();
const unappliedAmounts = buildUnappliedRows();

model.invoiceDocuments.slice(0, 12).forEach((invoice) => {
  writeFileSync(resolve(invoicePdfDir, invoice.pdfFileName), buildSimplePdf(renderInvoicePdfText(invoice)));
});

await exportWorkbook(resolve(outDir, "O2C-Daily-Finance-Pack.xlsx"), {
  "O2C Aging Template": agingTemplate,
  "Bank Statement Template": bankTemplate,
  "Total Data Matrix": totalDataMatrix,
  "Detailed Aging Report": detailedAgingReport,
  "Risk Accounts": riskAccounts,
  "Unapplied Amounts": unappliedAmounts,
  "IFRS 9 ECL Report": ifrs9EclReport,
  "Normal Aging": model.aging,
  "ECL Provision": model.ecl,
  "ECL Matrix": eclMatrixRows(model.rows).slice(0, 1000),
  "SLA Directory": model.slaProfiles,
  "Invoice PDF Queue": model.invoiceDocuments,
  "Payment Proof Audit": model.paymentProofAudit,
  "IFRS 7 BU DSO": model.ifrs,
  "Bank Reconciliation": model.reconciliation,
  "Expiry Reminders": model.reminders,
  "SOA Email Draft": [emailDraft]
});

console.log(`Daily workflow complete: ${resolve(outDir, "O2C-Daily-Finance-Pack.xlsx")}`);
console.log(`Dummy invoice PDFs complete: ${invoicePdfDir}`);

function buildSimplePdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 14 Tf",
    "72 760 Td",
    ...lines.map((line, index) => `${index === 0 ? "" : "0 -24 Td"}(${escapePdf(line)}) Tj`),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

function escapePdf(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildRiskAccountRows() {
  const byCustomer = new Map<string, typeof model.rows>();
  model.rows.forEach((row) => {
    const group = byCustomer.get(row.customerNumber) ?? [];
    group.push(row);
    byCustomer.set(row.customerNumber, group);
  });
  return [...byCustomer.entries()].map(([customerNumber, rows]) => {
    const outstanding = rows.reduce((total, row) => total + row.outstandingAmount, 0);
    const over90 = rows.filter((row) => row.daysPastDue > 90).reduce((total, row) => total + row.outstandingAmount, 0);
    const over180 = rows.filter((row) => row.daysPastDue > 180).reduce((total, row) => total + row.outstandingAmount, 0);
    const provision = rows.reduce((total, row) => total + row.provisionAmount, 0);
    const disputed = rows.filter((row) => row.status === "Disputed").length;
    const riskScore = (over180 > 0 ? 45 : 0) + (over90 > 1_000_000 ? 25 : 0) + (provision > 500_000 ? 20 : 0) + (disputed > 0 ? 10 : 0);
    return {
      "Customer Account Number": customerNumber,
      "Customer Name": rows[0]?.customerName ?? "",
      "Open Invoices": rows.filter((row) => row.outstandingAmount > 0).length,
      "Outstanding AED": Math.round(outstanding * 100) / 100,
      "Over 90 AED": Math.round(over90 * 100) / 100,
      "Over 180 AED": Math.round(over180 * 100) / 100,
      "Provision AED": Math.round(provision * 100) / 100,
      "Disputed Invoice Count": disputed,
      "Risk Score": riskScore,
      "Risk Flag": riskScore >= 70 ? "Critical" : riskScore >= 45 ? "High" : riskScore >= 20 ? "Watch" : "Normal",
      "Recommended Action": riskScore >= 70 ? "Escalate to credit committee and confirm ECL support." : riskScore >= 45 ? "Prioritize collector follow-up and proof review." : riskScore >= 20 ? "Monitor account and request updated payment status." : "Continue standard collection cycle."
    };
  }).sort((a, b) => Number(b["Risk Score"]) - Number(a["Risk Score"]));
}

function buildUnappliedRows() {
  const invoiceRows = model.rows
    .filter((row) => row.amount - row.appliedAmount > 0)
    .map((row) => ({
      Source: "Invoice",
      "Customer Account Number": row.customerNumber,
      "Customer Name": row.customerName,
      "Invoice Number": row.invoiceNumber,
      "Bank Reference": row.bankReference,
      "Transaction Number": row.transactionNumber,
      "Amount AED": row.amount,
      "Applied Amount AED": row.appliedAmount,
      "Unapplied Amount AED": Math.round(Math.max(0, row.amount - row.appliedAmount) * 100) / 100,
      "Days Past Due": row.daysPastDue,
      Status: row.status,
      "Required Action": row.appliedAmount > 0 ? "Review partial application and close residual balance." : "Apply receipt, collect payment, or confirm dispute."
    }));
  const receiptRows = model.reconciliation
    .filter((row) => row.matchStatus !== "Matched")
    .map((row) => ({
      Source: "Bank Receipt",
      "Customer Account Number": row.customerNumber,
      "Customer Name": row.customerName,
      "Invoice Number": row.invoiceNumber,
      "Bank Reference": row.bankReference,
      "Transaction Number": "",
      "Amount AED": row.amount,
      "Applied Amount AED": 0,
      "Unapplied Amount AED": row.amount,
      "Days Past Due": "",
      Status: row.matchStatus,
      "Required Action": row.exceptionReason ?? "Confirm invoice reference and apply receipt."
    }));
  return [...receiptRows, ...invoiceRows].sort((a, b) => Number(b["Unapplied Amount AED"]) - Number(a["Unapplied Amount AED"]));
}
