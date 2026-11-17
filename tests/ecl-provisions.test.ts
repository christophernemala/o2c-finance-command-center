import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEclDetailRows, parseEclRunDetail } from "../src/lib/ecl-provisions";
import { eclDetailHeaders, sourceAdapters } from "../src/lib/source-adapters";

const rows = [
  [...eclDetailHeaders],
  ["AC-1", "Customer One", "1000.00", "5", "40", "25.00", "AED", "model-row-1"],
  ["AC-1", "Customer One", "500.00", "10", "20", "15.00", "AED", "model-row-2"],
  ["AC-2", "Customer Two", "200.00", "0", "100", "0.00", "AED", "model-row-3"],
];

test("customer ECL detail groups by account and calculates exact simple formula against source values", () => {
  const result = parseEclDetailRows(rows, { complete: true, sourceLabel: "fixture.csv" });
  assert.equal(result.source_rows, 3);
  assert.equal(result.customers.length, 2);
  assert.deepEqual(result.customers[0], {
    account: "AC-1", customer: "Customer One", exposure: "1500.00", simple_ecl: "30.00",
    source_provision: "40.00", difference: "-10.00", source_references: ["model-row-1", "model-row-2"], rows: 2,
  });
  assert.equal(result.total_exposure, "1700.00");
  assert.equal(result.total_simple_ecl, "30.00");
  assert.equal(result.total_source_provision, "40.00");
  assert.equal(result.total_difference, "-10.00");
  assert.equal(result.complete, true);
});

test("customer ECL detail rejects wrong headers, currencies, rate ranges and inconsistent account identities", () => {
  assert.throws(() => parseEclDetailRows([["customer", ...eclDetailHeaders.slice(1)], ...rows.slice(1)]), /exact columns/);
  assert.throws(() => parseEclDetailRows([rows[0], ["AC-1", "Customer One", "1000.00", "101", "40", "25.00", "AED", "row"]]), /percentages/);
  assert.throws(() => parseEclDetailRows([rows[0], ["AC-1", "Customer One", "1000.00", "5", "40", "25.00", "USD", "row"]]), /AED/);
  assert.throws(() => parseEclDetailRows([rows[0], rows[1], ["AC-1", "Different Name", "10.00", "1", "1", "0.00", "AED", "row-2"]]), /conflicting/);
  assert.throws(() => parseEclDetailRows([rows[0], ["AC-1", "Customer One", "1.001", "5", "40", "0.00", "AED", "row"]]));
});

test("preserved run details require the explicit schema version and validate completeness separately", () => {
  const scenario = JSON.stringify({ schema_version: "o2c.ecl-customer-detail.v1", detail_complete: true, customer_provisions: rows.slice(1).map(row => Object.fromEntries(eclDetailHeaders.map((header, index) => [header, row[index]]))) });
  const parsed = parseEclRunDetail(scenario, "run-1");
  assert.equal(parsed.error, null);
  assert.equal(parsed.result?.source_rows, 3);
  assert.equal(parsed.result?.complete, true);
  assert.equal(parseEclRunDetail(JSON.stringify({ customer_provisions: [] }), "run-old").result, null);
  const invalid = parseEclRunDetail(JSON.stringify({ schema_version: "o2c.ecl-customer-detail.v1", customer_provisions: [{ account: "A" }] }), "run-bad");
  assert.equal(invalid.result, null);
  assert.ok(invalid.error);
});

test("the source registry lists only implemented bounded finance file paths", () => {
  assert.deepEqual(sourceAdapters.map(item => item.id), ["open-invoices", "bank-statement-lines", "customer-ecl-detail", "copilot-table-analysis"]);
  assert.equal(sourceAdapters.filter(item => item.handling === "review-and-stage").length, 2);
  assert.equal(sourceAdapters.find(item => item.id === "customer-ecl-detail")?.handling, "browser-analysis-only");
  assert.equal(sourceAdapters.find(item => item.id === "copilot-table-analysis")?.handling, "conversation-only");
  assert.deepEqual(sourceAdapters.find(item => item.importKind === "invoices")?.headers, ["number", "account", "customer", "issued_at", "due_date", "amount", "currency"]);
});
