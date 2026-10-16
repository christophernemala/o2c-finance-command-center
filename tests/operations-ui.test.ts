import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuardrailsView, IncidentsView, OperationsOverview } from "../src/components/operations";
import { compareFields } from "../src/lib/ai/context-compare";
import type { Snapshot } from "../src/types/workspace";
import type { GuardrailRecord, OpsOverview } from "../src/types/operations";

const base = { tenant_id: "00000000-0000-4000-8000-000000000010", entity_id: "00000000-0000-4000-8000-000000000020", role: "viewer" } as unknown as Snapshot;
const emptyOverview: OpsOverview = { window_hours: 24, runs: { finished: 0, succeeded: 0, running: 0, median_seconds: null, p95_seconds: null }, approvals: { pending: 0, oldest_hours: null },
  auto_posted_today: "0", cost_usd: "0", cost_by_agent: {}, tools: { results: 0, errors: 0 }, incidents: { open_critical: 0, open_warning: 0 }, health: null };
const draft = { name: "", kind: "max_amount", agent_kind: "all", tool: "propose_receipt", field: "", limit: "" };

test("operations overview shows empty states, never an estimated score", () => {
  const html = renderToStaticMarkup(createElement(OperationsOverview, { data: base, overview: emptyOverview, edges: [], incidents: [], failures: [], fields: [] }));
  assert.match(html, /Not enough runs yet/); assert.match(html, /No tool calls recorded/); assert.match(html, /No open incidents/);
  assert.doesNotMatch(html, /of 100/);
});

test("operations overview renders recorded health, handoffs and the context comparison", () => {
  const overview: OpsOverview = { ...emptyOverview, runs: { finished: 2, succeeded: 1, running: 0, median_seconds: 45, p95_seconds: 80 },
    health: { score: 56, inputs: { run_success: 50, approval_age: 100, incidents: 5, tool_errors: 75 }, weights: { run_success: 30, approval_age: 20, incidents: 20, tool_errors: 15 } } };
  const fields = compareFields("propose_receipt", { bank_line_id: "b", amount: "10.00", evidence: "x" }, "Invalid input: customer_id Required");
  const html = renderToStaticMarkup(createElement(OperationsOverview, { data: base, overview, incidents: [],
    edges: [{ agent: "cash_application", tool: "propose_receipt", calls: 4, ok: 3, failed: 1, p50_ms: 120 }],
    edge: { agent: "cash_application", tool: "propose_receipt" }, failures: [{ run_id: "r1", seq: 4, at: "2026-10-16T08:00:00Z", error: "Invalid input: customer_id Required", input: {} }], fields }));
  assert.match(html, />56</); assert.match(html, /1 \/ 2/); assert.match(html, /4 · 75%/);
  assert.equal(fields.find(field => field.name === "customer_id")?.status, "missing");
  assert.equal(fields.find(field => field.name === "amount")?.status, "match");
  assert.match(html, /Context comparison/);
});

test("guardrails: viewers see rules but no proposal forms; makers cannot decide their own change", () => {
  const rules: GuardrailRecord[] = [{ id: "g1", name: "Receipt cap", kind: "max_amount", agent_kind: "cash_application", params: { tool: "propose_receipt", limit: "5000.00" }, created_by: "u1", created_at: "2026-10-16T00:00:00Z",
    versions: [{ version: 1, stage: "monitor", status: "active", simulation: null, maker: "u1", checker: null, created_at: "", decided_at: "" },
      { version: 2, stage: "block", status: "pending", simulation: { days: 30, calls_replayed: 9, would_act_on: 1, failures_caught: 1, false_positives: 0, total_failures: 2, runs_affected: 1, cost_of_affected_runs_usd: "0.5" }, maker: "u1", checker: null, created_at: "", decided_at: null }] }];
  const viewer = renderToStaticMarkup(createElement(GuardrailsView, { data: base, rules, userId: "u9", draft, simulation: null }));
  assert.match(viewer, /Receipt cap/); assert.doesNotMatch(viewer, /Simulate a fix/); assert.doesNotMatch(viewer, />Approve</);
  const maker = renderToStaticMarkup(createElement(GuardrailsView, { data: { ...base, role: "approver" } as Snapshot, rules, userId: "u1", draft, simulation: null }));
  assert.doesNotMatch(maker, />Approve</); assert.match(maker, /A different approver or admin must decide/);
  const checker = renderToStaticMarkup(createElement(GuardrailsView, { data: { ...base, role: "approver" } as Snapshot, rules, userId: "u2", draft, simulation: null }));
  assert.match(checker, />Approve</); assert.match(checker, /would act on 1 of 9 calls/);
});

test("incidents: only approvers and admins can resolve", () => {
  const incidents = [{ id: "i1", kind: "stuck_run" as const, severity: "critical" as const, agent_kind: "collections", run_id: "r1", tool: null, detail: {}, cost_usd: null, opened_at: "2026-10-16T08:00:00Z", resolved_at: null, resolved_by: null }];
  assert.doesNotMatch(renderToStaticMarkup(createElement(IncidentsView, { data: base, incidents })), />Resolve</);
  assert.match(renderToStaticMarkup(createElement(IncidentsView, { data: { ...base, role: "admin" } as Snapshot, incidents })), />Resolve</);
});
