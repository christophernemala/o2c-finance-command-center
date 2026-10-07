import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, previewImport } from "../src/lib/imports";
test("CSV quotes, embedded separators and UTF-8 BOM", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"one,two","say ""yes"""\r\n'),[["a","b"],["one,two",'say "yes"']]);
  assert.throws(()=>parseCsv('a\n"open'));
  assert.throws(()=>parseCsv('a\n"closed"extra'));
});
test("import validation never substitutes missing amounts or corrupts currencies/direction", () => {
  const result=previewImport("reference,booked_at,direction,amount,currency\nA,2026-10-04,credit,0.10,AED\nB,2026-10-04,debit,0.20,AED\nC,2026-02-30,credit,1.00,AED\nD,2026-10-04,credit,1.001,AED\nA,2026-10-04,credit,1.00,AED\nE,2026-10-04,credit,1.00,USD", "bank_lines");
  assert.equal(result.total,"0.30"); assert.equal(result.rows.length,2); assert.equal(result.rows[1].direction,"debit"); assert.equal(result.errors.length,4);
});
test("invalid headers and oversized files fail closed", () => {
  assert.throws(()=>previewImport("amount\n100","bank_lines"));
  assert.throws(()=>parseCsv("a".repeat(1024*1024+1)));
});
