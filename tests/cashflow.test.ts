import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastWeeks, validateCashflowRun, chartRatio, type CashflowRun } from "../src/lib/cashflow";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run: CashflowRun = {
  id: id(1), tenant_id: id(10), entity_id: id(20), starts_on: "2026-10-05", opening_cash: "0.10",
  scenario: "Reviewed base scenario", model_version: "source-v1", source_digest: `sha256:${"a".repeat(64)}`,
  maker: id(2), checker: id(3), approved_at: "2026-10-04T12:00:00Z", evidence: "Reviewed opening cash and committed payments",
  confidence_percent: null, confidence_method: null,
  entries: [
    { id: "receipt", date: "2026-10-05", direction: "in", category: "operating", amount: "0.20", source_reference: "Test source only" },
    { id: "payment", date: "2026-10-11", direction: "out", category: "operating", amount: "0.40", source_reference: "Test source only" },
    { id: "funding", date: "2026-10-12", direction: "in", category: "financing", amount: "100.00", source_reference: "Test funding only" },
    { id: "asset", date: "2027-01-03", direction: "out", category: "investing", amount: "20.00", source_reference: "Test asset only" },
  ],
};
test("direct-method forecast conserves exact cash, includes week boundaries and negative cash", () => {
  const weeks = forecastWeeks(run);
  assert.equal(weeks.length, 13);
  assert.equal(weeks[0].incoming, "0.20"); assert.equal(weeks[0].outgoing, "0.40");
  assert.equal(weeks[0].operating_net, "-0.20"); assert.equal(weeks[0].closing, "-0.10");
  assert.equal(weeks[1].opening, "-0.10"); assert.equal(weeks[1].financing_net, "100.00");
  assert.equal(weeks[12].ends_on, "2027-01-03"); assert.equal(weeks[12].investing_net, "-20.00");
  assert.equal(weeks[12].closing, "79.90");
  assert.equal(forecastWeeks({ ...run, opening_cash: "9999999999999.99", entries: [{ ...run.entries[0], amount: "9999999999999.99" }] })[12].closing, "19999999999999.98");
});
test("forecast rejects cross-scope, self approval, missing lineage and ambiguous amounts", () => {
  assert.throws(() => validateCashflowRun(run, id(11), id(20)), /scope/);
  assert.throws(() => forecastWeeks({ ...run, checker: run.maker }), /approval/);
  for (const amount of [0.1, "1.001", "1e3", "-1.00", "0.00", "1,000.00"]) {
    assert.throws(() => forecastWeeks({ ...run, entries: [{ ...run.entries[0], amount: amount as string }] }));
  }
  assert.throws(() => forecastWeeks({ ...run, entries: [run.entries[0], run.entries[0]] }), /Duplicate/);
  assert.throws(() => forecastWeeks({ ...run, entries: [{ ...run.entries[0], date: "2027-01-04" }] }), /horizon/);
  assert.throws(() => forecastWeeks({ ...run, entries: [{ ...run.entries[0], date: "2026-02-30" }] }), /date/);
  assert.throws(() => forecastWeeks({ ...run, confidence_percent: "87.30" }), /confidence/);
  assert.throws(() => forecastWeeks({ ...run, entries: [{ ...run.entries[0], source_reference: "" }] }), /source/);
});
test("drawing ratios scale exact large decimals and zero scopes without NaN", () => {
  assert.equal(chartRatio("0.00", "0.00"), 0);
  assert.equal(chartRatio("99999999999999999999.99", "99999999999999999999.99"), 1);
  assert.equal(chartRatio("-0.10", "0.20"), -0.5);
});
