import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewPanels } from "../src/components/overview-panels";
import type { Snapshot, Workspace } from "../src/types/workspace";

const tenant = "00000000-0000-4000-8000-000000000010";
const entity = "00000000-0000-4000-8000-000000000020";
const base: Snapshot = {
  tenant_id: tenant, entity_id: entity, as_of: "2026-11-15", fetched_at: "2026-11-15T12:00:00Z", role: "viewer",
  insights: { forecast: null, charts: [{ key: "aging", title: "Open AR by aging", description: "Verified full-entity aging report for the selected entity.", unit: "AED", series: [
    { label: "Current", value: "1234.50" }, { label: "1–30", value: "987.65" }, { label: "31–60", value: "0.00" },
  ] }] },
  invoices: [], receipts: [], bank_lines: [], approvals: [], customers: [], ecl_runs: [], agent_runs: [], imports: [], audit: [],
  totals: { gross: "1500.00", open: "1234.50", overdue: "987.65", unapplied: "0.00", allowance: null, dso_days: null, cei_percent: null, invoice_count: 2, pending_count: 1 },
  page: 0, has_more: false,
  pagination: { invoices: false, receipts: false, bank_lines: false, approvals: false, ecl_runs: false, agent_runs: false, imports: false, audit: false },
};
const href = (target: Workspace) => `/preview?view=${target}`;
const render = (data = base) => renderToStaticMarkup(createElement(OverviewPanels, { data, href }));

test("overview aging uses the supplied full-entity source series and preserves exact AED values", () => {
  const html = render();
  assert.match(html, /Selected-entity aging buckets/);
  assert.match(html, /Verified full-entity aging report for the selected entity/);
  assert.match(html, /Current/);
  assert.match(html, /1–30/);
  assert.match(html, /1,234\.50/);
  assert.match(html, /987\.65/);
  assert.match(html, /As of 2026-11-15/);
  assert.match(html, /Current snapshot, not a live stream/);
});

test("missing aging source data stays unavailable instead of being derived from the current invoice page", () => {
  const withoutAging: Snapshot = { ...base, insights: { ...base.insights, charts: [] }, invoices: [{
    id: "invoice-1", number: "INV-1", customer: "Fixture Customer", customer_id: "customer-1", due_date: "2026-01-01",
    gross: "999.99", open: "999.99", lifecycle: "posted", settlement: "unpaid", dispute: "none", collection: "normal", version: 1,
  }] };
  const html = render(withoutAging);
  assert.match(html, /Aging totals are unavailable/);
  assert.match(html, /No invoice-page data is substituted/);
  assert.doesNotMatch(html, /999\.99/);
});

test("recovery links use existing workspaces and attribute no estimated recovered revenue", () => {
  const html = render();
  for (const view of ["collections", "reconciliation", "approvals", "reports"]) assert.ok(html.includes(`/preview?view=${view}`), view);
  assert.match(html, /independent approver/);
  assert.match(html, /Only approved and posted receipts change invoice settlement/);
  assert.match(html, /Recovered revenue is not estimated or attributed/);
});

test("Power BI and Twilio Voice remain explicitly unconfigured, with the call action disabled", () => {
  const html = render();
  assert.match(html, /Power BI is not connected/);
  assert.match(html, /no external report is embedded/);
  assert.match(html, /Twilio code supports SMS and WhatsApp only/);
  assert.match(html, /no Voice call endpoint or status callback/);
  assert.match(html, /Human approval is required before any future call/);
  assert.match(html, /Twilio Account SID, API key SID, and API key secret/);
  assert.match(html, /Microsoft Entra tenant\/directory ID and application\/client ID/);
  assert.match(html, /Call unavailable/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*Call unavailable/);
});
