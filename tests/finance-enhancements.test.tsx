import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CashflowScenario } from "../src/components/cashflow-scenario";
import { CashflowForecast } from "../src/components/finance-charts";
import { EclProvisionList } from "../src/components/ecl-provision-list";
import { syntheticSnapshot } from "../src/lib/demo/synthetic";

test("synthetic cashflow preview exposes explainable, explicitly unapproved timing controls", () => {
  const run = syntheticSnapshot.insights.forecast;
  assert.ok(run);
  const html = renderToStaticMarkup(createElement(CashflowScenario, { run }));
  for (const phrase of ["Cashflow timing scenarios", "Receipt delay assumption", "Payment deferral assumption", "What-if only.", "approved base", "What-if view · not approved", "source run", "Week 13 closing"]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /2026-11-15/);
});

test("approved cashflow forecast renders phone-safe cards for weekly values and source movements", () => {
  const run = syntheticSnapshot.insights.forecast;
  assert.ok(run);
  const html = renderToStaticMarkup(createElement(CashflowForecast, { run, asOf: run.starts_on }));
  assert.match(html, /aria-label="Thirteen-week forecast amounts"/);
  assert.match(html, /aria-label="Preserved cash source movements"/);
  assert.match(html, /Synthetic receipt timing example/);
});

test("synthetic ECL preview shows source customer rows without allocating the run aggregate", () => {
  const html = renderToStaticMarkup(createElement(EclProvisionList, { runs: syntheticSnapshot.ecl_runs }));
  for (const phrase of ["Preserved ECL measurement runs", "Customer-level provision detail", "Synthetic Customer 01", "Synthetic Customer 02", "AED", "EAD × PD × LGD", "Synthetic ECL row 01", "not an IFRS 9 conclusion", "customer-source provision subtotal less run allowance", "Preserved ECL scenario JSON", "Customer detail schema example"]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /Source provision total/);
  assert.match(html, /Fictional sample only/);
});
