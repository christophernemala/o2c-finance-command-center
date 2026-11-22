import { test } from "node:test";
import assert from "node:assert/strict";
import { commandSchema, credentialsSchema } from "../src/lib/validation";
const scope = { tenant: "00000000-0000-4000-8000-000000000010", entity: "00000000-0000-4000-8000-000000000020" };
test("server schemas reject unbounded credentials, fractional cents, unsupported commands and missing review", () => {
  assert.equal(credentialsSchema.parse({ email: " Work@Example.invalid ", password: "unchanged spaces " }).email, "work@example.invalid");
  for (const input of [{ email: "x@", password: "p" }, { email: "a@example.invalid", password: "p".repeat(257) }, { email: "a@example.invalid", password: null }]) assert.equal(credentialsSchema.safeParse(input).success, false);
  const base = { ...scope, intent: "propose", id: scope.entity, kind: "receipt", bank: scope.entity, customer: scope.entity, evidence: "Source evidence reference", amount: "0.10" };
  assert.equal(commandSchema.safeParse(base).success, true);
  for (const amount of [0.1, "0.001", "1e2", "-1.00"]) assert.equal(commandSchema.safeParse({ ...base, amount }).success, false);
  assert.equal(commandSchema.safeParse({ ...base, intent: "close_invoice" }).success, false);
  assert.equal(commandSchema.safeParse({ ...scope, id: scope.entity, intent: "execute", version: "2" }).success, false);
  assert.equal(commandSchema.safeParse({ ...scope, id: scope.entity, intent: "execute", version: "2", acknowledge: "yes" }).success, true);
});
test("stage command accepts only supported extensions within CSV and XLSX size boundaries", () => {
  const stage = (name: string, size: number) => commandSchema.safeParse({ ...scope, intent: "stage", kind: "invoices", file: new File([new Uint8Array(size)], name) }).success;
  assert.equal(stage("source.csv", 1024 * 1024), true);
  assert.equal(stage("source.csv", 1024 * 1024 + 1), false);
  assert.equal(stage("source.xlsx", 8 * 1024 * 1024), true);
  assert.equal(stage("source.xlsx", 8 * 1024 * 1024 + 1), false);
  assert.equal(stage("source.txt", 1), false);
  assert.equal(stage("unsafe.xlsx", 1), true, "schema checks extension and bounds; the server parser validates workbook structure before staging");
});
