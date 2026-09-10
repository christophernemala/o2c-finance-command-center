import type { FinanceRow } from "../../shared/types";

export function buildExpiryReminders(rows: FinanceRow[], asOf = "2026-06-13") {
  const today = new Date(`${asOf}T00:00:00.000Z`).getTime();
  const dayMs = 86400000;
  return rows.flatMap((row) => {
    const chequeDays = Math.ceil((new Date(`${row.chequeExpiryDate}T00:00:00.000Z`).getTime() - today) / dayMs);
    const licenseDays = Math.ceil((new Date(`${row.tradeLicenseExpiryDate}T00:00:00.000Z`).getTime() - today) / dayMs);
    const reminders = [];
    if (chequeDays <= 30) {
      reminders.push({ customerName: row.customerName, customerNumber: row.customerNumber, type: "Security Cheque", dueDate: row.chequeExpiryDate, daysRemaining: chequeDays, action: "Request renewed security cheque." });
    }
    if (licenseDays <= 45) {
      reminders.push({ customerName: row.customerName, customerNumber: row.customerNumber, type: "Trade License", dueDate: row.tradeLicenseExpiryDate, daysRemaining: licenseDays, action: "Request updated trade license and resubmission documents." });
    }
    return reminders;
  });
}
