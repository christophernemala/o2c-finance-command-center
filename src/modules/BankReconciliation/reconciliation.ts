import type { BankStatementLine, FinanceRow, ReconciliationResult } from "../../shared/types";

export function reconcileBankStatements(rows: FinanceRow[], statements: BankStatementLine[]): ReconciliationResult[] {
  return statements.map((statement) => {
    const exact = rows.find((row) => row.bankReference === statement.bankReference || row.invoiceNumber === statement.invoiceNumber);
    if (exact && Math.abs(exact.paidAmount - statement.amount) < 1) {
      return toResult(statement, exact, "Matched", 0.99);
    }
    if (exact) {
      return toResult(statement, exact, "Suggested", 0.76, "Reference matched but amount variance requires review.");
    }
    const fuzzy = rows.find((row) => row.customerName === statement.customerName && Math.abs(row.outstandingAmount - statement.amount) < 500);
    if (fuzzy) {
      return toResult(statement, fuzzy, "Suggested", 0.62, "Customer and amount proximity matched.");
    }
    return {
      bankReference: statement.bankReference,
      invoiceNumber: statement.invoiceNumber ?? "Unidentified",
      customerName: statement.customerName,
      customerNumber: "Unknown",
      amount: statement.amount,
      matchStatus: "Exception",
      matchConfidence: 0.18,
      exceptionReason: "No invoice or reference match found."
    };
  });
}

function toResult(statement: BankStatementLine, row: FinanceRow, matchStatus: ReconciliationResult["matchStatus"], matchConfidence: number, exceptionReason?: string): ReconciliationResult {
  return {
    bankReference: statement.bankReference,
    invoiceNumber: row.invoiceNumber,
    customerName: row.customerName,
    customerNumber: row.customerNumber,
    amount: statement.amount,
    matchStatus,
    matchConfidence,
    exceptionReason
  };
}
