import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { MAX_WORKBOOK_BYTES, parseXlsx } from "../src/modules/ExcelUpload/excelParser";

function workbook(sheet: string): ArrayBuffer {
  const zip = zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet) });
  return Uint8Array.from(zip).buffer;
}

test("ordinary numeric workbook still parses", () => {
  const sheets = parseXlsx(workbook('<worksheet><row><c r="A1"><v>Amount</v></c></row><row><c r="A2"><v>100</v></c></row></worksheet>'));
  assert.equal(sheets[0].rows[0].Amount, "100");
});

test("oversized input is rejected before decompression", () => {
  assert.throws(() => parseXlsx(new ArrayBuffer(MAX_WORKBOOK_BYTES + 1)), /10 MB/);
});

test("compressed expansion bomb is rejected", () => {
  const payload = workbook("x".repeat(17 * 1024 * 1024));
  assert.ok(payload.byteLength < MAX_WORKBOOK_BYTES);
  assert.throws(() => parseXlsx(payload), /safe processing limits/);
});

test("malicious column reference cannot allocate an enormous row", () => {
  assert.throws(() => parseXlsx(workbook('<worksheet><row><c r="ZZZZZZZZZ1"><v>100</v></c></row></worksheet>')), /256 columns/);
});

test("excessive archive entry count is rejected", () => {
  const files = Object.fromEntries(Array.from({ length: 257 }, (_, i) => ["entry" + i, strToU8("x")]));
  assert.throws(() => parseXlsx(Uint8Array.from(zipSync(files)).buffer), /safe processing limits/);
});
