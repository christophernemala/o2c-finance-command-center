import { test } from "node:test";
import assert from "node:assert/strict";
import { receivablesReport } from "../src/lib/receivables-report";
import type { Snapshot } from "../src/types/workspace";

// Disposable report fixtures; never loaded by the application.
function fixture(): Snapshot {
  return {
    tenant_id: "tenant", entity_id: "entity", as_of: "2026-10-05", fetched_at: "2026-10-05T12:00:00Z", role: "viewer",
    customers: [{ id: "customer", name: '=HYPERLINK("https://example.invalid")', account: "account" }],
    invoices: [{ id: "invoice", number: "source-reference", customer: "Test customer", customer_id: "customer",
      due_date: "2026-09-05", gross: "9999999999999.99", open: "0.10", lifecycle: "posted", settlement: "partial",
      dispute: "none", collection: "normal", version: 1 }],
    receipts: [], bank_lines: [], approvals: [], ecl_runs: [], agent_runs: [], imports: [], audit: [],
    insights: { forecast: null, charts: [{ key: "aging", title: "Aging", description: "Full entity", unit: "AED", series: [{ label: "1–30", value: "100.20" }] }] },
    totals: { gross: "9999999999999.99", open: "100.20", overdue: "100.20", unapplied: "0.00", allowance: null, dso_days: null, cei_percent: null, invoice_count: 51, pending_count: 0 },
    page: 0, has_more: true,
    pagination: { invoices: true, receipts: false, bank_lines: false, approvals: false, ecl_runs: false, agent_runs: false, imports: false, audit: false },
  };
}
test("receivables report separates full-entity aging from paginated invoice control totals", () => {
  const source = fixture(); const before = JSON.stringify(source); const report = receivablesReport(source);
  assert.equal(report["Report scope"][0]["Open AED all invoices"], "100.20");
  assert.equal(report["Report scope"][0]["Open AED exported rows"], "0.10");
  assert.equal(report["Report scope"][0]["Gross AED exported rows"], "9999999999999.99");
  assert.match(report["Report scope"][0]["Invoice detail scope"], /First 50/);
  assert.equal(report["Entity aging totals"][0]["Open AED"], "100.20");
  assert.equal(report["Invoice detail page 1"][0]["Aging bucket"], "1–30");
  assert.equal(report["Customer directory"][0].Customer, source.customers[0].name);
  assert.equal(JSON.stringify(source), before);
});
test("report refuses missing verified aging and does not generate empty customer or invoice records", () => {
  const source = fixture(); source.insights.charts = [];
  assert.throws(() => receivablesReport(source), /unavailable/);
  source.insights.charts = fixture().insights.charts; source.invoices = []; source.customers = [];
  const report = receivablesReport(source);
  assert.deepEqual(report["Invoice detail page 1"], []); assert.deepEqual(report["Customer directory"], []);
  assert.equal(report["Report scope"][0]["Open AED exported rows"], "0.00");
});
