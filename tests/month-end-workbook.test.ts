import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { monthEndWorkbook, validateArPack, validateCloseBreakdown } from "../src/lib/ar-pack";
import { buildWorkbookBytes } from "../src/modules/DashboardRenderer/browserExcel";
const asOf = "2026-10-31";
const breakdown = (dimension: "category" | "region", amount: string) => validateCloseBreakdown({
  dimension, as_of: asOf, category: null, region: null,
  total: { customers: 1, invoices: 1, open: amount, current: amount, d1_30: "0.00", d31_60: "0.00", d61_90: "0.00", d90_plus: "0.00", disputed: "0.00" },
  rows: [{ label: dimension === "category" ? "Services" : "Dubai", account: null, customer_id: null, customers: 1, invoices: 1, open: amount,
    current: amount, d1_30: "0.00", d31_60: "0.00", d61_90: "0.00", d90_plus: "0.00", disputed: "0.00", share_percent: "100.00" }],
}, dimension, asOf);
function pack(open: string) {
  return validateArPack({ as_of: asOf, open_ar: open, overdue_ar: "0.00", disputed_ar: "0.00", unapplied_cash: "0.00", open_invoice_count: 1, customer_count: 1,
    unposted_bank_credits: 0, pending_approvals: 0, aging: [{ bucket: "Current", amount: open, invoices: 1 }],
    top_debtors: [{ customer: "Example Customer", account: "C-1", open, overdue: null, oldest_due: null, invoices: 1 }],
    dso_countback_days: null, dso_basis: "Insufficient history", cei_30d_percent: null,
    cei_basis: { period_start: "2026-10-01", period_end: asOf, beginning_ar: open, credit_sales: "0.00", debit_notes: "0.00", credit_notes: "0.00", ending_ar: open, ending_current_ar: open },
  });
}
test("month-end workbook contains data-backed aging and dimension pivots with exact-decimal tie-out checks", () => {
  const amount = "99999999999999999999999999.99";
  const sheets = monthEndWorkbook(pack(amount), "Test entity", breakdown("category", amount), breakdown("region", amount), "2026-11-16T12:00:00.000Z");
  const rows = sheets["Close tie-out checks"];
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.Status === "Ties" && row["Difference AED"] === "0.00"));
  assert.equal(sheets["Category pivot"][0]["Open AED"], amount);
  assert.equal(sheets["Region pivot"][0]["Open AED"], amount);
  assert.match(String(sheets["Close summary"][5].Value), /not a historical balance reconstruction/i);
  const zip = unzipSync(buildWorkbookBytes(sheets));
  const workbook = strFromU8(zip["xl/workbook.xml"]);
  assert.match(workbook, /AR aging pivot/); assert.match(workbook, /Category pivot/); assert.match(workbook, /Region pivot/);
  for (const name of Object.keys(zip).filter(path => path.startsWith("xl/worksheets/sheet"))) assert.doesNotMatch(strFromU8(zip[name]), /<f>/, "financial reports contain no executable spreadsheet formulas");
});
test("month-end workbook flags a real source-versus-pivot discrepancy instead of silently hiding it", () => {
  const result = monthEndWorkbook(pack("12.00"), "Test entity", breakdown("category", "10.00"), breakdown("region", "12.00"), "2026-11-16T12:00:00.000Z");
  assert.equal(result["Close tie-out checks"][0].Status, "Ties");
  assert.equal(result["Close tie-out checks"][1].Status, "Investigate");
  assert.equal(result["Close tie-out checks"][1]["Difference AED"], "-2.00");
  assert.equal(result["Close tie-out checks"][2].Status, "Ties");
});
test("close breakdown validation rejects mismatched scope, malformed totals and incomplete data", () => {
  const source = { dimension: "category", as_of: asOf, total: { customers: 1, invoices: 1, open: "1.00", current: "1.00", d1_30: "0.00", d31_60: "0.00", d61_90: "0.00", d90_plus: "0.00", disputed: "0.00" }, rows: [] };
  assert.throws(() => validateCloseBreakdown({ ...source, as_of: "2026-10-30" }, "category", asOf));
  assert.throws(() => validateCloseBreakdown({ ...source, total: { ...source.total, open: 1 } }, "category", asOf));
});
