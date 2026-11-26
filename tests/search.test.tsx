import React from "react"; void React;
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateInvoiceMatches } from "../src/lib/search";
import { WorkspaceSearch } from "../src/components/workspace-search";
const tenant = "10000000-0000-4000-8000-000000000001";
const entity = "20000000-0000-4000-8000-000000000001";
const valid = { id: "30000000-0000-4000-8000-000000000001", number: "INV-1001", customer: "Northwind Services", account: "C-100", due_date: "2026-10-31", open: "9007199254740.91", days_overdue: 16, dispute: "none", collection: "follow_up" };
test("invoice search validates exact AED values and scoped result fields", () => {
  const rows = validateInvoiceMatches([valid]);
  assert.equal(rows[0].open, "9007199254740.91"); assert.equal(rows[0].number, "INV-1001");
  assert.throws(() => validateInvoiceMatches([{ ...valid, open: 1 }]));
  assert.throws(() => validateInvoiceMatches([{ ...valid, id: "not-an-id" }]));
  assert.throws(() => validateInvoiceMatches([{ ...valid, due_date: "2026-02-31" }]));
  assert.throws(() => validateInvoiceMatches(Array(101).fill(valid)));
});
test("global workspace search has a labelled combobox, keyboard shortcut and bounded result list", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceSearch, { tenant, entity, previewMode: true, items: [
    { label: "Customer Copilot", detail: "Ask about a customer", href: "/?view=copilot", kind: "Action" },
    { label: "Month-end close analysis workbook", detail: "Download pivot-style Excel analysis", href: "/?view=reports", kind: "Action" },
  ] }));
  assert.match(html, /role="combobox"/); assert.match(html, /Search O2C workspaces and records/);
  assert.match(html, /Search customers, invoices, reports/); assert.match(html, /⌘ K/);
  assert.match(html, /aria-expanded="false"/);
});

test("workspace search preserves visible focus and selected-result cues", async () => {
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.workspace-search > input:focus\s*\{[^}]*outline:/);
  assert.match(css, /\.workspace-search-results > a:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /\.workspace-search-results > a:hover, \.workspace-search-results > a\[aria-selected="true"\]/);
});
