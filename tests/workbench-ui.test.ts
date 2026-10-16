import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionsView } from "../src/components/collections";
import { dailyPackWorkbook, validateDailyPack } from "../src/lib/daily-pack";
import type { Snapshot } from "../src/types/workspace";
import type { CustomerAccount } from "../src/types/collections";

const base = { tenant_id: "00000000-0000-4000-8000-000000000010", entity_id: "00000000-0000-4000-8000-000000000020", role: "viewer", as_of: "2026-10-16" } as unknown as Snapshot;
const empty = { worklist: [], account: null, emailReady: true, userId: "u1", callList: [], followUps: [], allFollowUps: false, licences: [], remarks: null };
const account: CustomerAccount = { customer: { id: "c1", name: "Customer One", account: "C1" }, invoices: [], contacts: [], promises: [], hold: null, credit_limit: null, pending_limit: null, messages: [] };

test("workbench shows empty states and no invented numbers", () => {
  const html = renderToStaticMarkup(createElement(CollectionsView, { data: base, ...empty }));
  assert.match(html, /Nobody left to call today/); assert.match(html, /No follow-ups due/); assert.match(html, /No licence alerts/);
  assert.match(html, /report=daily/);
});

test("call list shows the score and its reasons; viewers cannot log remarks", () => {
  const html = renderToStaticMarkup(createElement(CollectionsView, { data: base, ...empty, account,
    callList: [{ customer_id: "c1", customer: "Customer One", account: "C1", overdue: "1000.00", oldest_days: 100, broken_promises: 0, on_hold: false, contacts: 0, score: "2111.11", why: "100 days overdue · no contact on file", last_note: null }],
    followUps: [{ customer_id: "c1", customer: "Customer One", account: "C1", due: "2026-10-15", days_late: 1, last_reason: "promised", last_note: "Will pay", owner: "u1", remark_id: "r1" }],
    licences: [{ id: "l1", customer_id: "c1", customer: "Customer One", account: "C1", licence_number: "CN-1", authority: "DET", expiry_date: "2026-10-14", days_left: -2, expired: true }],
    remarks: { remarks: [{ id: "r1", invoice_id: null, reason: "promised", channel: "call", note: "Will pay", next_follow_up: "2026-10-15", promise_id: "p1", created_by: "u2", created_at: "2026-10-12T08:00:00Z" }], licences: [] } }));
  assert.match(html, /score 2111\.11/); assert.match(html, /100 days overdue · no contact on file/); assert.match(html, /1d late/); assert.match(html, /Expired 2d ago/);
  assert.match(html, /Promised to pay/); assert.doesNotMatch(html, /Log remark/); assert.doesNotMatch(html, /Record a licence/);
  const approver = renderToStaticMarkup(createElement(CollectionsView, { data: { ...base, role: "approver" } as Snapshot, ...empty, account, remarks: { remarks: [], licences: [] } }));
  assert.match(approver, /Log remark/); assert.doesNotMatch(approver, /name="promise_amount" inputMode/, "approvers log calls but not promises");
  const maker = renderToStaticMarkup(createElement(CollectionsView, { data: { ...base, role: "maker" } as Snapshot, ...empty, account, remarks: { remarks: [], licences: [] } }));
  assert.match(maker, /name="promise_amount"/); assert.match(maker, /Record a licence/);
});

test("daily pack keeps amounts as decimal strings and rejects malformed rows", () => {
  const pack = validateDailyPack({ as_of: "2026-10-16", entity: "Entity", followUps: [], licences: [], remarks: [], worklist: [],
    callList: [{ customer_id: "c1", customer: "Customer One", account: "C1", overdue: "1000.00", oldest_days: 100, broken_promises: 0, on_hold: false, contacts: 0, score: "2111.11", why: "w", last_note: null }] });
  const book = dailyPackWorkbook(pack);
  assert.deepEqual(Object.keys(book), ["Summary", "Call list", "Follow-ups due", "Remarks today", "Trade licences", "Worklist"]);
  assert.equal(book["Call list"][0]["Overdue AED"], "1000.00"); assert.equal(book["Call list"][0].Score, "2111.11");
  assert.throws(() => validateDailyPack({ ...pack, callList: [{ ...pack.callList[0], overdue: 1000 }] }), /Invalid/);
  assert.throws(() => validateDailyPack({ ...pack, remarks: null }), /Invalid remarks/);
  const amounts = { open: "99.50", current: "0.00", d1_30: "99.50", d31_60: "0.00", d61_90: "0.00", d90_plus: "0.00", disputed: "0.00" };
  const byCategory = { dimension: "category", as_of: "2026-10-16", category: null, region: null, total: { ...amounts, customers: 1, invoices: 1 },
    rows: [{ ...amounts, label: "Unassigned", account: null, customer_id: null, customers: 1, invoices: 1, share_percent: "100.00" }] };
  const withSegments = dailyPackWorkbook(validateDailyPack({ ...pack, byCategory }));
  assert.deepEqual(withSegments["By category"][0], { Category: "Unassigned", Customers: "1", "Open AED": "99.50", "Current AED": "0.00", "1-30 AED": "99.50", "31-60 AED": "0.00", "61-90 AED": "0.00", "90+ AED": "0.00", "Disputed AED": "0.00", "Share %": "100.00" });
  assert.throws(() => validateDailyPack({ ...pack, byRegion: { ...byCategory, total: { ...byCategory.total, open: 99.5 } } }), /Invalid/);
});
