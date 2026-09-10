import type { FinanceRow } from "../../shared/types";
import { sum } from "../AgingAnalytics/aging";

export function buildIfrsDisclosure(rows: FinanceRow[]) {
  const byBusinessUnit = new Map<string, FinanceRow[]>();
  for (const row of rows) {
    byBusinessUnit.set(row.businessUnit, [...(byBusinessUnit.get(row.businessUnit) ?? []), row]);
  }
  return Array.from(byBusinessUnit.entries()).map(([businessUnit, scopedRows]) => {
    const grossAr = sum(scopedRows, "amount");
    const outstandingAr = sum(scopedRows, "outstandingAmount");
    const paidAmount = sum(scopedRows, "paidAmount");
    const over90 = sum(scopedRows.filter((row) => row.daysPastDue > 90), "outstandingAmount");
    const weightedDaysLate = Math.round(scopedRows.reduce((total, row) => total + Math.max(row.daysPastDue, 0) * row.outstandingAmount, 0) / Math.max(outstandingAr, 1));
    const buDso = Math.round((outstandingAr / Math.max(grossAr / 365, 1)) * 10) / 10;
    const ceoControlIndex = Math.round((100 - Math.min((over90 / Math.max(outstandingAr, 1)) * 100, 100)) * 10) / 10;
    return {
      businessUnit,
      grossAr,
      outstandingAr,
      paidAmount,
      over90,
      weightedDaysLate,
      buDso,
      creditRiskConcentration: Math.round((over90 / Math.max(outstandingAr, 1)) * 1000) / 10,
      liquidityExposure: outstandingAr - paidAmount,
      ceoControlIndex,
      disclosureCue: over90 > outstandingAr * 0.25 ? "High overdue concentration requires IFRS 7 sensitivity note." : "Standard credit-risk disclosure."
    };
  });
}
