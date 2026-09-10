import type { AgingBucket, FinanceRow } from "../../shared/types";

const agingOrder: AgingBucket[] = ["Current", "1-30", "31-60", "61-90", "91-180", "181-360", "361+"];

export function summarizeNormalAging(rows: FinanceRow[]) {
  return agingOrder.map((bucket) => {
    const bucketRows = rows.filter((row) => row.agingBucket === bucket);
    return {
      bucket,
      invoices: bucketRows.length,
      outstanding: sum(bucketRows, "outstandingAmount"),
      paid: sum(bucketRows, "paidAmount"),
      received: sum(bucketRows, "receivedAmount")
    };
  });
}

export function sum(rows: FinanceRow[], field: keyof Pick<FinanceRow, "amount" | "paidAmount" | "outstandingAmount" | "receivedAmount" | "provisionAmount">) {
  return Math.round(rows.reduce((total, row) => total + Number(row[field]), 0) * 100) / 100;
}
