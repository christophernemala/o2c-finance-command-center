import { test } from "node:test";
import assert from "node:assert/strict";
import { riskBands, filterWorklist } from "../src/lib/collections/explorer";
import type { WorklistRow } from "../src/types/collections";
const row = (customer: string, days: number, overdue: string): WorklistRow => ({ customer_id: customer, customer, account: `ACC-${customer}`, oldest_days: days, overdue, open: overdue, overdue_invoices: 1, disputed_invoices: 0, broken_promises: 0, open_promises: 0, on_hold: false, contacts: 1, credit_limit: null, last_message: null });
const rows = [row("One", 30, "0.10"), row("Two", 31, "0.20"), row("Three", 120, "9999999999999.99"), row("Four", 121, "0.30"), row("Five", 180, "0.40"), row("Six", 181, "0.50")];
test("account risk bands are disjoint and preserve exact account balances", () => {
  const bands = riskBands(rows);
  assert.deepEqual(bands.map(b => [b.label, b.count, b.amount]), [["1–30 days",1,"0.10"],["31–60 days",1,"0.20"],["61–90 days",0,"0.00"],["91–120 days",1,"9999999999999.99"],["121–180 days",2,"0.70"],["181+ days",1,"0.50"]]);
});
test("worklist search, risk selection and decimal ordering combine without mutating server rows", () => {
  assert.deepEqual(filterWorklist(rows, "acc-four", "all", "overdue").map(r => r.customer), ["Four"]);
  assert.deepEqual(filterWorklist(rows, "", "121_180", "overdue").map(r => r.customer), ["Five", "Four"]);
  assert.deepEqual(filterWorklist(rows, "", "all", "age").map(r => r.oldest_days), [181,180,121,120,31,30]);
  assert.equal(filterWorklist(rows, "", "all", "overdue")[0].customer, "Three");
  assert.equal(rows[0].customer, "One");
  assert.deepEqual(filterWorklist([], "", "all", "overdue"), []);
});
