import type { FinanceRow, SlaProfile } from "../../shared/types";

const owners = ["Mira Shah", "Omar Khan", "Lena Ortiz", "Nadia Abbas", "Ravi Menon"];

export function buildSlaProfiles(rows: FinanceRow[]): SlaProfile[] {
  const seen = new Map<string, FinanceRow>();
  rows.forEach((row) => {
    if (!seen.has(row.customerNumber)) seen.set(row.customerNumber, row);
  });

  return [...seen.values()].map((row, index) => ({
    customerNumber: row.customerNumber,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    slaEmailSource: row.slaEmailSource,
    paymentTermsDays: [30, 45, 60, 75][index % 4],
    collectorOwner: owners[index % owners.length],
    escalationOwner: owners[(index + 2) % owners.length],
    creditLimitAed: 500000 + index * 175000,
    statementCadence: index % 3 === 0 ? "Weekly" : index % 3 === 1 ? "Biweekly" : "Monthly",
    disputeTurnaroundDays: [3, 5, 7][index % 3],
    preferredAttachment: index % 3 === 0 ? "Both" : index % 3 === 1 ? "SOA Excel" : "Invoice PDF",
    contractReference: `SLA-O2C-${String(index + 1).padStart(4, "0")}`
  }));
}

export function findSlaProfile(profiles: SlaProfile[], customerNumber: string) {
  const normalized = customerNumber.trim().toUpperCase();
  return profiles.find((profile) => profile.customerNumber.toUpperCase() === normalized);
}
