export type AgingBucket = "Current" | "1-30" | "31-60" | "61-90" | "91-180" | "181-360" | "361+";
export type EclBucket = "Current" | "1-30" | "31-60" | "61-90" | "91-120" | "121-180" | "180+";
export type InvoiceStatus = "Open" | "Partially Applied" | "Closed" | "Disputed" | "Promise To Pay" | "Write Off Review";
export type MatchStatus = "Matched" | "Suggested" | "Exception" | "Unmatched";

export interface FinanceRow {
  id: string;
  transactionDescription: string;
  transactionNumber: string;
  glDate: string;
  glAccount: string;
  appliedAmount: number;
  paymentDate?: string;
  paymentReference?: string;
  customerName: string;
  customerNumber: string;
  customerEmail: string;
  bankReference: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  outstandingAmount: number;
  receivedAmount: number;
  entity: string;
  businessUnit: string;
  currency: "AED";
  daysPastDue: number;
  agingBucket: AgingBucket;
  eclBucket: EclBucket;
  provisionRate: number;
  provisionAmount: number;
  status: InvoiceStatus;
  comments: AuditComment[];
  chequeExpiryDate: string;
  tradeLicenseExpiryDate: string;
  slaEmailSource: "SLA" | "Contract" | "Master Data";
}

export interface AuditComment {
  at: string;
  user: string;
  text: string;
}

export interface BankStatementLine {
  id: string;
  date: string;
  bankAccount: string;
  bankReference: string;
  invoiceNumber?: string;
  customerName: string;
  customerNumber: string;
  amount: number;
  currency: "AED";
  description: string;
}

export interface ReconciliationResult {
  bankReference: string;
  invoiceNumber: string;
  customerName: string;
  customerNumber: string;
  amount: number;
  matchStatus: MatchStatus;
  matchConfidence: number;
  exceptionReason?: string;
}

export interface EmailDraft {
  customerName: string;
  customerNumber: string;
  to: string;
  subject: string;
  body: string;
  attachmentName: string;
}

export interface SlaProfile {
  customerNumber: string;
  customerName: string;
  customerEmail: string;
  slaEmailSource: "SLA" | "Contract" | "Master Data";
  paymentTermsDays: number;
  collectorOwner: string;
  escalationOwner: string;
  creditLimitAed: number;
  statementCadence: "Weekly" | "Biweekly" | "Monthly";
  disputeTurnaroundDays: number;
  preferredAttachment: "SOA Excel" | "Invoice PDF" | "Both";
  contractReference: string;
}

export interface InvoiceDocument {
  invoiceNumber: string;
  customerNumber: string;
  customerName: string;
  amount: number;
  currency: "AED";
  invoiceDate: string;
  dueDate: string;
  pdfFileName: string;
  exportStatus: "Ready" | "Exported" | "Imported";
  importStatus: "Pending" | "Verified" | "Rejected";
  agentAction: string;
}

export interface PaymentProofAudit {
  bankReference: string;
  invoiceNumber: string;
  customerNumber: string;
  customerName: string;
  paymentAmount: number;
  currency: "AED";
  proofType: "Bank Statement" | "Receipt Advice" | "Remittance Email" | "Manual Upload";
  proofFileName: string;
  auditStatus: "Matched" | "Needs Review" | "Rejected";
  reviewedBy: string;
  reviewedAt: string;
  auditNote: string;
}
