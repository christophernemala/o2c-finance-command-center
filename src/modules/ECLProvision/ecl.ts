import type { EclBucket, FinanceRow } from "../../shared/types";
import { sum } from "../AgingAnalytics/aging";

const eclOrder: EclBucket[] = ["Current", "1-30", "31-60", "61-90", "91-120", "121-180", "180+"];

export function summarizeEclProvision(rows: FinanceRow[]) {
  return eclOrder.map((bucket) => {
    const bucketRows = rows.filter((row) => row.eclBucket === bucket);
    const outstanding = sum(bucketRows, "outstandingAmount");
    const provisioned = sum(bucketRows, "provisionAmount");
    return {
      "ECL Bucket": bucket,
      bucket,
      invoices: bucketRows.length,
      "Outstanding AED": outstanding,
      outstanding,
      "Provision AED": provisioned,
      provisioned,
      "Provision Rate": bucketRows[0]?.provisionRate ?? 0,
      paid: sum(bucketRows, "paidAmount"),
      received: sum(bucketRows, "receivedAmount"),
      "IFRS 9 Logic": bucket === "180+" ? "Above 180 days: 100% ECL provision" : "IFRS 9 provision matrix",
      ifrs9Note: bucket === "180+" ? "Above 180 days: 100% ECL provision" : "IFRS 9 provision matrix",
      fullProvisionCount: bucketRows.filter((row) => row.daysPastDue > 180 && row.provisionRate === 1).length
    };
  });
}

export function eclMatrixRows(rows: FinanceRow[]) {
  return rows.map((row) => ({
    transactionDescription: row.transactionDescription,
    transactionNumber: row.transactionNumber,
    glData: `${row.glDate} | ${row.glAccount}`,
    appliedAmount: row.appliedAmount,
    paymentData: row.paymentReference ? `${row.paymentDate} | ${row.paymentReference}` : "Unapplied",
    customerName: row.customerName,
    customerNumber: row.customerNumber,
    eclBucket: row.eclBucket,
    provisionRate: row.provisionRate,
    outstandingAmount: row.outstandingAmount,
    provisionAmount: row.provisionAmount,
    ifrs9Note: row.daysPastDue > 180 ? "180+ days: 100% ECL" : "Provision by ECL aging bucket"
  }));
}
