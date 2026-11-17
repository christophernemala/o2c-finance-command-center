import type { Entity, Membership, Snapshot } from "@/types/workspace";
import type { CashflowRun } from "@/lib/cashflow";

/**
 * Fictional, deterministic O2C records for local UI and import testing only.
 * Never use these rows as business data or connect them to a live customer tenant.
 */
export const SYNTHETIC_AS_OF = "2026-11-15";
export const syntheticTenantId = "00000000-0000-4000-8000-000000000001";
export const syntheticEntityId = "00000000-0000-4000-8000-000000000002";
export const syntheticViewerId = "00000000-0000-4000-8000-000000000003";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const money = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
const csvCell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const csv = (headers: string[], rows: string[][]) => [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";

export const syntheticMemberships: Membership[] = [{ tenant_id: syntheticTenantId, tenant_name: "Synthetic O2C Lab · TEST DATA", role: "viewer" }];
export const syntheticEntities: Entity[] = [{ id: syntheticEntityId, name: "Example Legal Entity · Synthetic", currency: "AED" }];

const sectors = ["Distribution", "Contracting", "Healthcare", "Technology", "Property Services", "Manufacturing", "Retail", "Logistics"];
const customers = Array.from({ length: sectors.length }, (_, index) => ({
  id: id(100 + index), account: `SYN-${String(index + 1).padStart(4, "0")}`,
  name: `Synthetic Customer ${String(index + 1).padStart(2, "0")} · ${sectors[index]}`,
}));
const dueDates = ["2026-12-15", "2026-11-05", "2026-10-01", "2026-08-20", "2026-07-01"];
const issueDates = ["2026-10-01", "2026-09-01", "2026-07-15", "2026-06-01", "2026-04-15"];
const amountFactors = [100, 115, 140, 220, 80];
const invoices = customers.flatMap((customer, customerIndex) => {
  const baseCents = 850_000 + customerIndex * 90_000;
  return dueDates.map((dueDate, invoiceIndex) => {
    const gross = money(Math.round(baseCents * amountFactors[invoiceIndex] / 100));
    const isDisputed = invoiceIndex === 2 && customerIndex % 3 === 0;
    const collection = invoiceIndex === 4 ? "follow_up" : invoiceIndex === 3 && customerIndex % 2 === 0 ? "promise_to_pay" : "normal";
    return {
      id: id(1000 + customerIndex * dueDates.length + invoiceIndex),
      number: `SYN-2026-${String(customerIndex * dueDates.length + invoiceIndex + 1).padStart(5, "0")}`,
      customer: customer.name, customer_id: customer.id, account: customer.account,
      issued_at: issueDates[invoiceIndex], due_date: dueDate, gross, open: gross,
      lifecycle: "posted" as const, settlement: "unpaid", dispute: isDisputed ? "open" as const : "none" as const,
      collection: collection as "normal" | "follow_up" | "promise_to_pay", version: 1,
    };
  });
});

const bankLines = Array.from({ length: 12 }, (_, index) => {
  const direction = index % 5 === 4 ? "debit" as const : "credit" as const;
  const matchingInvoice = invoices[index % invoices.length];
  const amount = direction === "credit" ? matchingInvoice.gross : money(1_250_000 + index * 37_500);
  return {
    id: id(2000 + index), reference: `SYN-BANK-2026-${String(index + 1).padStart(3, "0")}`,
    booked_at: `2026-11-${String(index + 1).padStart(2, "0")}`, direction, amount,
    posted: false, version: 1,
  };
});

const pendingBankIndexes = [0, 1, 2];
const approvals = pendingBankIndexes.map((bankIndex, index) => {
  const bank = bankLines[bankIndex];
  const invoice = invoices[bankIndex];
  const customer = customers.find(row => row.id === invoice.customer_id)!;
  return {
    id: id(3000 + index), kind: "receipt" as const, amount: bank.amount, maker: syntheticViewerId,
    approver: null, status: "pending" as const, invoice_id: null, receipt_id: null, bank_line_id: bank.id,
    customer_id: customer.id, invoice_version: null, receipt_version: null, bank_version: bank.version,
    evidence: `Synthetic test proposal for ${bank.reference}; no real remittance advice is represented.`,
    version: 1, created_at: `2026-11-15T0${index + 6}:00:00.000Z`, agent_run_id: null,
    captured_versions: { invoice: null, receipt: null, bank_line: bank.version },
    source_records: {
      customer: { id: customer.id, name: customer.name, account: customer.account }, invoice: null, receipt: null,
      bank_line: { id: bank.id, reference: bank.reference, booked_at: bank.booked_at, direction: bank.direction, amount: bank.amount, version: bank.version },
    },
  };
});

const sumCents = (values: string[]) => values.reduce((total, value) => {
  const [whole, decimal = "00"] = value.split(".");
  return total + Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}, 0);
const ageDays = (dueDate: string) => Math.floor((Date.parse(`${SYNTHETIC_AS_OF}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
const bucket = (dueDate: string) => {
  const days = ageDays(dueDate);
  return days < 0 ? "Not yet due" : days <= 30 ? "1–30 days" : days <= 60 ? "31–60 days" : days <= 90 ? "61–90 days" : "91+ days";
};
const groupAmounts = (key: (row: typeof invoices[number]) => string) => {
  const totals = new Map<string, number>();
  for (const row of invoices) {
    const label = key(row);
    totals.set(label, (totals.get(label) ?? 0) + sumCents([row.open]));
  }
  return [...totals].map(([label, cents]) => ({ label, value: money(cents) }));
};
const groupCounts = <T,>(rows: T[], key: (row: T) => string) => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, value: String(count) }));
};
const byOpen = customers.map(customer => ({
  label: customer.account,
  value: money(sumCents(invoices.filter(row => row.customer_id === customer.id).map(row => row.open))),
})).sort((a, b) => sumCents([b.value]) - sumCents([a.value])).slice(0, 5);
const overdueCents = sumCents(invoices.filter(row => row.due_date < SYNTHETIC_AS_OF).map(row => row.open));
const totalCents = sumCents(invoices.map(row => row.gross));
const syntheticForecast: CashflowRun = {
  id: id(7000), tenant_id: syntheticTenantId, entity_id: syntheticEntityId, starts_on: SYNTHETIC_AS_OF,
  opening_cash: "500000.00", scenario: "Synthetic illustration · no business forecast", model_version: "synthetic-direct-v1",
  source_digest: `sha256:${"3".repeat(64)}`, maker: id(7001), checker: id(7002),
  approved_at: "2026-11-15T08:00:00.000Z", evidence: "Fictional preview-only cash movements; not source-system data.",
  confidence_percent: null, confidence_method: null,
  entries: [
    { id: "SYN-CF-001", date: "2026-11-20", direction: "in", category: "operating", amount: "175000.00", source_reference: "Synthetic receipt timing example" },
    { id: "SYN-CF-002", date: "2026-11-21", direction: "out", category: "operating", amount: "125000.00", source_reference: "Synthetic payroll example" },
    { id: "SYN-CF-003", date: "2026-12-07", direction: "in", category: "operating", amount: "200000.00", source_reference: "Synthetic receipt timing example" },
    { id: "SYN-CF-004", date: "2026-12-03", direction: "out", category: "operating", amount: "160000.00", source_reference: "Synthetic supplier payment example" },
    { id: "SYN-CF-005", date: "2027-01-15", direction: "out", category: "investing", amount: "50000.00", source_reference: "Synthetic capex example" },
  ],
};
const syntheticEclScenario = JSON.stringify({
  schema_version: "o2c.ecl-customer-detail.v1", detail_complete: true,
  customer_provisions: [
    { account: "SYN-0001", customer: "Synthetic Customer 01 · Distribution", exposure: "100000.00", pd_percent: "5.00", lgd_percent: "40.00", source_provision: "2100.00", currency: "AED", source_reference: "Synthetic ECL row 01" },
    { account: "SYN-0002", customer: "Synthetic Customer 02 · Contracting", exposure: "75000.00", pd_percent: "2.00", lgd_percent: "50.00", source_provision: "700.00", currency: "AED", source_reference: "Synthetic ECL row 02" },
  ],
  synthetic_only: true,
});

export const syntheticSnapshot: Snapshot = {
  tenant_id: syntheticTenantId, entity_id: syntheticEntityId, as_of: SYNTHETIC_AS_OF,
  fetched_at: "2026-11-15T08:00:00.000Z", role: "viewer", page: 0, has_more: false,
  pagination: { invoices: false, receipts: false, bank_lines: false, approvals: false, ecl_runs: false, agent_runs: false, imports: false, audit: false },
  customers: customers.map(({ id: customerId, name, account }) => ({ id: customerId, name, account })),
  invoices: invoices.map(row => { const { account, ...invoice } = row; void account; return invoice; }), receipts: [], bank_lines: bankLines, approvals,
  ecl_runs: [{ id: id(6000), model_version: "synthetic-sample-v1", exposure_snapshot: "Fictional sample only; not a customer exposure snapshot.", scenario: syntheticEclScenario, allowance: "2800.00", status: "approved", as_of: SYNTHETIC_AS_OF }],
  agent_runs: [{ id: id(4000), name: "Synthetic fixture · no AI provider call", status: "completed", operation_id: null, updated_at: "2026-11-15T08:00:00.000Z" }],
  imports: [
    { id: id(5000), file_name: "synthetic-open-invoices.csv", status: "review", rows: invoices.length, total: money(totalCents), digest: `sha256:${"1".repeat(64)}`, created_at: "2026-11-15T07:30:00.000Z" },
    { id: id(5001), file_name: "synthetic-bank-lines.csv", status: "review", rows: bankLines.length, total: money(sumCents(bankLines.map(row => row.amount))), digest: `sha256:${"2".repeat(64)}`, created_at: "2026-11-15T07:31:00.000Z" },
  ],
  audit: [],
  totals: { gross: money(totalCents), open: money(totalCents), overdue: money(overdueCents), unapplied: "0.00", allowance: "2800.00", dso_days: null, cei_percent: null, invoice_count: invoices.length, pending_count: approvals.length },
  insights: { forecast: syntheticForecast, charts: [
    { key: "aging", title: "Open AR by aging", description: "Synthetic unpaid invoice balances grouped into non-overlapping due-date bands as of 15 Nov 2026.", unit: "AED", series: groupAmounts(row => bucket(row.due_date)) },
    { key: "customer_concentration", title: "Largest synthetic accounts", description: "Open invoice balances for the five largest sample accounts. Names and figures are fictional.", unit: "AED", series: byOpen },
    { key: "collections", title: "Collection work states", description: "Fictional invoice balances grouped by the sample collection state.", unit: "AED", series: groupAmounts(row => row.collection) },
    { key: "disputes", title: "Dispute states", description: "Fictional open receivables grouped by recorded sample dispute state.", unit: "AED", series: groupAmounts(row => row.dispute) },
    { key: "approvals", title: "Approval queue", description: "Sample pending proposals only; no action has been submitted or posted.", unit: "records", series: groupCounts(approvals, row => row.status) },
    { key: "bank_direction", title: "Synthetic bank statement", description: "Incoming credits and outgoing debits supplied only to test the import/reconciliation screens.", unit: "AED", series: [...new Set(bankLines.map(row => row.direction))].map(direction => ({ label: direction, value: money(sumCents(bankLines.filter(row => row.direction === direction).map(row => row.amount))) })) },
  ] },
};

export const syntheticInvoicesCsv = () => csv(
  ["number", "account", "customer", "issued_at", "due_date", "amount", "currency"],
  invoices.map(row => [row.number, row.account, row.customer, row.issued_at, row.due_date, row.gross, "AED"]),
);
export const syntheticBankLinesCsv = () => csv(
  ["reference", "booked_at", "direction", "amount", "currency"],
  bankLines.map(row => [row.reference, row.booked_at, row.direction, row.amount, "AED"]),
);
