import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { buildWorkbookBytes } from "../src/modules/DashboardRenderer/browserExcel";
import { readXlsx } from "../src/lib/xlsx-read";
import { previewImportRows, columns } from "../src/lib/imports";
const headers = columns.bank_lines;
const row = { reference: "BANK-001", booked_at: "2026-10-31", direction: "credit", amount: "9999999999999.99", currency: "AED" };
test("exported XLSX worksheet with a title row imports through the same strict exact-header source review", () => {
  const bytes = buildWorkbookBytes({ "Bank statement": [row] });
  const sheet = readXlsx(bytes)[0];
  assert.equal(sheet.name, "Bank statement");
  const preview = previewImportRows(sheet.rows, "bank_lines");
  assert.equal(preview.rows.length, 1); assert.equal(preview.total, "9999999999999.99");
  assert.equal(preview.rows[0].reference, "BANK-001");
  assert.deepEqual(headers, ["reference", "booked_at", "direction", "amount", "currency"]);
});
test("XLSX parser flags cached formula cells so import review can reject stale calculated values", () => {
  const files = unzipSync(buildWorkbookBytes({ "Bank statement": [row] }));
  const path = "xl/worksheets/sheet1.xml";
  const source = strFromU8(files[path]);
  const cell = /<c r="D3"[^>]*>.*?<\/c>/.exec(source)?.[0];
  assert.ok(cell, "fixture has an amount cell");
  files[path] = strToU8(source.replace(cell, '<c r="D3" t="str"><f>5000000000+1</f><v>5000000001</v></c>'));
  const parsed = readXlsx(zipSync(files))[0];
  assert.equal(parsed.contains_formulas, true);
  assert.equal(parsed.truncated, undefined, "formula presence is not misreported as truncation");
});
