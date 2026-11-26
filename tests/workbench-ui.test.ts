import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionsView } from "../src/components/collections";
import { AgentConsole } from "../src/components/agent-console";
import { Reports } from "../src/components/reports";
import { Copilot, type PendingCopilotRequest } from "../src/components/copilot";
import { copilotHistoryTools } from "../src/lib/ai/copilot-history";
import { dailyPackWorkbook, validateDailyPack } from "../src/lib/daily-pack";
import type { Snapshot } from "../src/types/workspace";
import type { CustomerAccount, WorklistRow } from "../src/types/collections";

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

test("collection worklist and customer invoice tables are labelled keyboard-scrollable regions", () => {
  const row: WorklistRow = { customer_id: "c1", customer: "Customer One", account: "C1", overdue: "100.00", open: "100.00", overdue_invoices: 1, oldest_days: 20,
    disputed_invoices: 0, broken_promises: 0, open_promises: 0, on_hold: false, contacts: 1, credit_limit: null, last_message: null };
  const invoiceAccount: CustomerAccount = { ...account, invoices: [{ id: "i1", number: "INV-1", issued_at: "2026-01-01", due_date: "2026-02-01", gross: "100.00", open: "100.00", days_overdue: 20, dispute: "none" }] };
  const html = renderToStaticMarkup(createElement(CollectionsView, { ...empty, data: { ...base, role: "viewer" } as Snapshot, account: invoiceAccount, worklist: [row] }));
  assert.match(html, /role="region" aria-label="Collections worklist" tabindex="0"/);
  assert.match(html, /role="region" aria-label="Customer open invoices" tabindex="0"/);
});

test("AR report tables expose named keyboard-scrollable regions", () => {
  const pack = { as_of: "2026-10-16", open_ar: "100.00", overdue_ar: "50.00", disputed_ar: "0.00", unapplied_cash: "0.00", open_invoice_count: 1, customer_count: 1,
    unposted_bank_credits: 0, pending_approvals: 0, aging: [{ bucket: "1–30 days", amount: "50.00", invoices: 1 }],
    top_debtors: [{ customer: "Customer One", account: "C1", open: "100.00", overdue: "50.00", oldest_due: "2026-10-01", invoices: 1 }],
    dso_countback_days: "30", dso_basis: "countback", cei_30d_percent: "80.00", cei_basis: { period_start: "2026-09-16", period_end: "2026-10-16", beginning_ar: "100.00", credit_sales: "0.00", debit_notes: "0.00", credit_notes: "0.00", ending_ar: "100.00", ending_current_ar: "50.00" } };
  const html = renderToStaticMarkup(createElement(Reports, { pack, tenant: base.tenant_id, entity: base.entity_id }));
  assert.match(html, /role="region" aria-label="Aging by days past due" tabindex="0"/);
  assert.match(html, /role="region" aria-label="Top debtors by open balance" tabindex="0"/);
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

test("collections offers phone outreach only with channel consent and shows actual channel and provider acceptance", () => {
  const phoneAccount: CustomerAccount = { ...account,
    contacts: [{ id: "k1", name: "Reem", email: "ar@example.com", role: "ar", is_primary: true, phone: "+971501234567", sms_opt_in: true, whatsapp_opt_in: false }],
    invoices: [{ id: "i1", number: "INV-1", issued_at: "2026-01-01", due_date: "2026-02-01", gross: "1200.50", open: "1200.50", days_overdue: 100, dispute: "none" }],
    messages: [{ id: "m1", tone: "firm", channel: "sms", subject: "Reminder", body: "Approved reminder for payment", to: "+971501234567", total_overdue: "1200.50", invoice_ids: ["i1"], attach_statement: false, status: "sent", maker: "u1", checker: "u2", agent_run_id: null, error: null, created_at: "2026-10-16T10:00:00Z", sent_at: "2026-10-16T10:01:00Z", provider_id: `SM${"b".repeat(32)}` }],
  };
  const html = renderToStaticMarkup(createElement(CollectionsView, { ...empty, data: { ...base, role: "maker" } as Snapshot, account: phoneAccount }));
  assert.match(html, /Propose SMS/); assert.doesNotMatch(html, /Propose WhatsApp/);
  assert.match(html, /Accepted by provider/); assert.match(html, /SMS/); assert.match(html, /name="phone"/);
  assert.match(html, /Consent evidence/);
});

test("an agent hold proposal is shown as pending; only approvers can approve or reject it", () => {
  const holdProposals = [{ id: "h1", customer_id: "c1", customer: "Customer One", account: "C1", reason: "INV-1 is 120 days overdue", agent_run_id: "r1", proposed_by: "agent", created_at: "2026-10-16T10:00:00Z" }];
  const maker = renderToStaticMarkup(createElement(CollectionsView, { ...empty, data: { ...base, role: "maker" } as Snapshot, account, holdProposals }));
  assert.match(maker, /Credit holds proposed by the agent/); assert.match(maker, /Not in effect until an approver or admin approves it/);
  assert.doesNotMatch(maker, /Approve hold/); assert.doesNotMatch(maker, /Credit hold active/);
  const approver = renderToStaticMarkup(createElement(CollectionsView, { ...empty, data: { ...base, role: "approver" } as Snapshot, account, holdProposals }));
  assert.match(approver, /Approve hold/); assert.match(approver, /value="hold_decide"/); assert.match(approver, /name="note" required/);
});

test("a reloaded Copilot thread can check its persisted request without duplicating model work", () => {
  const pending: PendingCopilotRequest = { requestId: "00000000-0000-4000-8000-000000000201", message: "Summarize overdue AR", files: [], allowProposals: false };
  const html = renderToStaticMarkup(createElement(Copilot, { tenant: base.tenant_id, entity: base.entity_id, thread: "00000000-0000-4000-8000-000000000200",
    initial: [{ role: "user", content: pending.message }], aiReady: true, canWrite: true,
    budget: { date: "2026-11-15", daily_limit_usd: "1.000000", spent_usd: "0.100000", reserved_usd: "0.200000", remaining_usd: "0.700000", open_reservations: 1, configured: true, paused: false }, pending }));
  assert.match(html, /This Copilot request was interrupted or may still be running/);
  assert.match(html, /Retry\/check this same request \(no duplicate model call\)/);
  assert.match(html, /Check the pending Copilot request before asking another question/);
  assert.match(html, /Daily budget: USD 1\.000000/);
});

test("saved Copilot traces expose only validated tool outcomes, never tool inputs", () => {
  assert.deepEqual(copilotHistoryTools([
    { tool: "get_ar_overview", ok: true, input: { internal: "not for source badges" } },
    { tool: "list_invoices", ok: false, input: { search: "private" } },
    { tool: "bad", ok: "true" }, null, "invalid",
  ]), [
    { tool: "get_ar_overview", status: "ok" },
    { tool: "list_invoices", status: "error" },
  ]);
});

test("Copilot answers show entity scope and truthful source and proposal states", () => {
  const html = renderToStaticMarkup(createElement(Copilot, {
    tenant: base.tenant_id, entity: base.entity_id, entityName: "Convergint Middle East & Africa", thread: "00000000-0000-4000-8000-000000000200",
    initial: [
      { role: "user", content: "Summarise the account." },
      { role: "assistant", content: "Here is the saved result.", tools: [
        { tool: "get_customer_account", status: "ok" },
        { tool: "propose_allocation", status: "ok" },
        { tool: "get_ar_kpi_pack", status: "error" },
      ] },
    ], aiReady: true, canWrite: true,
    budget: { date: "2026-11-15", daily_limit_usd: "1.000000", spent_usd: "0.100000", reserved_usd: "0.200000", remaining_usd: "0.700000", open_reservations: 1, configured: true, paused: false },
  }));
  assert.match(html, /Convergint Middle East &amp; Africa/);
  assert.match(html, /1 data tool completed/);
  assert.match(html, /Customer account/);
  assert.match(html, /Allocation proposal/);
  assert.match(html, /Approval required/);
  assert.match(html, /AR KPI pack/);
  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, /3 data tools completed/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(html, /class="copilot-transcript"[^>]*aria-live/);
  assert.match(html, /Allow pending proposals for this message/);
  assert.match(html, /It cannot approve or post/);
});

test("Copilot welcome presents suggested finance questions without inventing ledger results", () => {
  const html = renderToStaticMarkup(createElement(Copilot, {
    tenant: base.tenant_id, entity: base.entity_id, entityName: "Selected UAE entity", thread: "00000000-0000-4000-8000-000000000200",
    initial: [], aiReady: true, canWrite: false,
    budget: { date: "2026-11-15", daily_limit_usd: "1.000000", spent_usd: "0.100000", reserved_usd: "0.200000", remaining_usd: "0.700000", open_reservations: 1, configured: true, paused: false },
  }));
  assert.match(html, /Receivables answers, with the evidence behind them/);
  assert.match(html, /Try asking/);
  assert.match(html, /Which bank credits could match invoices\?/);
  assert.match(html, /Scoped to Selected UAE entity/);
  assert.match(html, /Ask about customers, invoices, cash or KPIs/);
  assert.match(html, /class="copilot-quick-check"/);
  assert.doesNotMatch(html, /copilot-mascot|copilot-cat|robo-cat/);
  assert.doesNotMatch(html, /AED [0-9]/);
});

test("the Copilot overdue quick action runs the existing guarded starter", () => {
  const html = renderToStaticMarkup(createElement(Copilot, {
    tenant: base.tenant_id, entity: base.entity_id, entityName: "Selected UAE entity", thread: "00000000-0000-4000-8000-000000000201",
    initial: [], aiReady: true, canWrite: false,
    budget: { date: "2026-11-15", daily_limit_usd: "1.000000", spent_usd: "0.100000", reserved_usd: "0.200000", remaining_usd: "0.700000", open_reservations: 1, configured: true, paused: false },
  }));
  assert.match(html, /class="copilot-quick-check"/);
  assert.match(html, /Ask Copilot who the top 5 overdue customers are and how much they owe/);
  assert.match(html, /Overdue review/);
  assert.match(html, /Top 5 customers · amounts owed/);
  const action = html.match(/<button type="button" class="copilot-quick-check"[^>]*>/)?.[0];
  assert.ok(action); assert.doesNotMatch(action, /disabled=/);
});

test("Copilot styles contain no mascot artwork or mascot animation", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /copilot-mascot|copilot-cat|copilot-head-nod|copilot-halo-breathe/);
  assert.match(css, /\.copilot-quick-check:focus-visible/);
});

test("an admin can switch an existing daily agent schedule to manual without an AI budget", () => {
  const html = renderToStaticMarkup(createElement(AgentConsole, {
    data: { ...base, role: "admin" } as Snapshot,
    consoleData: { agent_user: null, schedules: { cash_application: "daily" }, policies: [], auto_posted_today: "0.00", runs: [] },
    aiReady: false, aiBudget: null, userId: "u1",
  }));
  const manual = /<button([^>]*)>Switch to manual<\/button>/.exec(html);
  const schedule = /<button([^>]*)>Schedule daily<\/button>/.exec(html);
  assert.ok(manual); assert.doesNotMatch(manual[1], /\bdisabled\b/);
  assert.ok(schedule); assert.match(schedule[1], /\bdisabled\b/);
});
