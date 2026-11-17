import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Snapshot } from "../src/types/workspace";
import { previewImport } from "../src/lib/imports";
import { parseEclRunDetail } from "../src/lib/ecl-provisions";
import { SYNTHETIC_AS_OF, syntheticBankLinesCsv, syntheticInvoicesCsv, syntheticSnapshot } from "../src/lib/demo/synthetic";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const toMinor = (value: string) => {
  const [whole, fraction = "00"] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
const fromMinor = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

async function asUser(db: PGlite, userId: string, token: number) {
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [userId]);
  const hash = String(token).padStart(64, "0");
  await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do update set aal='aal1'", [hash, userId]);
  await db.query("select set_config('o2c.session_hash',$1,false)", [hash]);
  await db.exec("set role authenticated");
}

async function migratedDatabase() {
  const db = new PGlite();
  const dir = new URL("../postgres/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter(name => name.endsWith(".sql")).sort();
  assert.ok(files.length > 0, "migration directory should not be empty");
  for (const file of files) await db.exec(await readFile(new URL(file, dir), "utf8"));
  return db;
}

test("fictional O2C test pack matches the application's importer and preview snapshot", async () => {
  const invoiceCsv = syntheticInvoicesCsv();
  const bankCsv = syntheticBankLinesCsv();
  assert.equal(await readFile(new URL("../test-data/synthetic-o2c/invoices.csv", import.meta.url), "utf8"), invoiceCsv);
  assert.equal(await readFile(new URL("../test-data/synthetic-o2c/bank-lines.csv", import.meta.url), "utf8"), bankCsv);

  const invoices = previewImport(invoiceCsv, "invoices");
  const bankLines = previewImport(bankCsv, "bank_lines");
  assert.deepEqual(invoices.errors, []);
  assert.deepEqual(bankLines.errors, []);
  assert.equal(invoices.rows.length, 40);
  assert.equal(bankLines.rows.length, 12);
  assert.equal(new Set(invoices.rows.map(row => row.account)).size, 8);
  assert.ok(invoices.rows.every(row => row.number.startsWith("SYN-") && row.customer.startsWith("Synthetic Customer")));
  assert.ok(bankLines.rows.every(row => row.reference.startsWith("SYN-BANK-") && row.currency === "AED"));
  assert.deepEqual(new Set(syntheticSnapshot.insights.charts[0].series.map(row => row.label)), new Set(["Not yet due", "1–30 days", "31–60 days", "61–90 days", "91+ days"]));
  assert.equal(syntheticSnapshot.as_of, SYNTHETIC_AS_OF);
  assert.match(syntheticSnapshot.insights.forecast?.scenario ?? "", /Synthetic illustration/);
  assert.equal(syntheticSnapshot.insights.forecast?.entries.every(row => row.source_reference.startsWith("Synthetic")), true);
  assert.match(syntheticSnapshot.ecl_runs[0].exposure_snapshot, /Fictional sample only/);
  const sampleEcl = parseEclRunDetail(syntheticSnapshot.ecl_runs[0].scenario, "synthetic fixture");
  assert.equal(sampleEcl.result?.customers.length, 2);
  assert.equal(sampleEcl.result?.total_source_provision, syntheticSnapshot.ecl_runs[0].allowance);
  assert.match(syntheticSnapshot.customers[0].name, /^Synthetic Customer/);
  assert.match(syntheticSnapshot.invoices[0].number, /^SYN-/);
});

test("synthetic import, receipt and allocation follow maker-checker controls in disposable PostgreSQL", async () => {
  const db = await migratedDatabase();
  const tenantId = id(9000);
  const entityId = id(9001);
  const makerId = id(9002);
  const checkerId = id(9003);
  try {
    await db.query("insert into auth.users(id) values($1),($2)", [makerId, checkerId]);
    await db.query("insert into public.tenants(id,name) values($1,'Synthetic test company · TEST DATA')", [tenantId]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver')", [tenantId, makerId, checkerId]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Synthetic legal entity · AED')", [entityId, tenantId]);

    const invoicePayload = previewImport(syntheticInvoicesCsv(), "invoices");
    const bankPayload = previewImport(syntheticBankLinesCsv(), "bank_lines");
    await asUser(db, makerId, 9002);
    const invoiceBatch = (await db.query<{ stage_import: string }>(
      "select public.stage_import($1,$2,'invoices','synthetic-open-invoices.csv',$3::jsonb)",
      [tenantId, entityId, JSON.stringify(invoicePayload.rows)],
    )).rows[0].stage_import;
    const bankBatch = (await db.query<{ stage_import: string }>(
      "select public.stage_import($1,$2,'bank_lines','synthetic-bank-lines.csv',$3::jsonb)",
      [tenantId, entityId, JSON.stringify(bankPayload.rows)],
    )).rows[0].stage_import;

    await asUser(db, checkerId, 9003);
    const commitInvoice = () => db.query("select public.commit_import($1,$2,$3)", [tenantId, entityId, invoiceBatch]);
    const commitBank = () => db.query("select public.commit_import($1,$2,$3)", [tenantId, entityId, bankBatch]);
    await commitInvoice();
    await commitBank();
    await commitInvoice();
    await commitBank();

    await db.exec("reset role");
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.receipts where tenant_id=$1", [tenantId])).rows[0].count, 0);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.journals where tenant_id=$1", [tenantId])).rows[0].count, 0);

    await asUser(db, makerId, 9002);
    const readSnapshot = async () => (await db.query<{ workspace_snapshot: Snapshot }>(
      "select public.workspace_snapshot($1,$2,$3,0)", [tenantId, entityId, SYNTHETIC_AS_OF],
    )).rows[0].workspace_snapshot;
    const imported = await readSnapshot();
    assert.equal(imported.customers.length, 8);
    assert.equal(imported.invoices.length, 40);
    assert.equal(imported.totals.invoice_count, 40);
    assert.equal(imported.totals.open, invoicePayload.total);
    assert.equal(imported.bank_lines.length, 12);
    assert.equal(imported.bank_lines.filter(row => row.direction === "debit").length, 2);
    assert.ok(imported.bank_lines.every(row => !row.posted));
    assert.equal(imported.totals.pending_count, 0);

    const credit = imported.bank_lines.find(row => row.direction === "credit")!;
    const sampleInvoiceSequence = Number(credit.reference.slice(-3));
    const invoiceNumber = `SYN-2026-${String(sampleInvoiceSequence).padStart(5, "0")}`;
    const invoice = imported.invoices.find(row => row.number === invoiceNumber)!;
    assert.equal(credit.amount, invoice.gross);
    const receiptCommand = id(9004);
    await db.query(
      "select public.propose_action($1,$2,$3,'receipt',$4,$5,null,null,$6,$7)",
      [tenantId, entityId, receiptCommand, credit.amount, `Synthetic test remittance ${credit.reference}; fictional evidence only.`, credit.id, invoice.customer_id],
    );
    await asUser(db, checkerId, 9003);
    await db.query("select public.decide_action($1,$2,$3,1,'approved')", [tenantId, entityId, receiptCommand]);
    await db.query("select public.execute_action($1,$2,$3,2)", [tenantId, entityId, receiptCommand]);

    await db.exec("reset role");
    const receiptId = (await db.query<{ id: string }>("select id from public.receipts where tenant_id=$1 limit 1", [tenantId])).rows[0].id;
    await asUser(db, makerId, 9002);
    const allocationMinor = Math.floor(toMinor(invoice.gross) / 2);
    const allocationCommand = id(9005);
    await db.query(
      "select public.propose_action($1,$2,$3,'allocation',$4,$5,$6,$7)",
      [tenantId, entityId, allocationCommand, fromMinor(allocationMinor), "Synthetic partial allocation test; fictional evidence only.", invoice.id, receiptId],
    );
    await asUser(db, checkerId, 9003);
    await db.query("select public.decide_action($1,$2,$3,1,'approved')", [tenantId, entityId, allocationCommand]);
    await db.query("select public.execute_action($1,$2,$3,2)", [tenantId, entityId, allocationCommand]);

    await asUser(db, makerId, 9002);
    const posted = await readSnapshot();
    assert.equal(posted.totals.invoice_count, 40);
    assert.equal(posted.totals.open, fromMinor(toMinor(invoicePayload.total) - allocationMinor));
    assert.equal(posted.totals.unapplied, fromMinor(toMinor(invoice.gross) - allocationMinor));
    assert.equal(posted.invoices.find(row => row.id === invoice.id)?.open, fromMinor(toMinor(invoice.gross) - allocationMinor));
    assert.equal(posted.receipts.length, 1);
    assert.equal(posted.receipts[0].residual, fromMinor(toMinor(invoice.gross) - allocationMinor));
    assert.equal(posted.bank_lines.find(row => row.id === credit.id)?.posted, true);
    assert.ok(posted.bank_lines.filter(row => row.direction === "debit").every(row => !row.posted));
    assert.equal(posted.totals.pending_count, 0);

    await db.exec("reset role");
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.receipts where tenant_id=$1", [tenantId])).rows[0].count, 1);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.journals where tenant_id=$1", [tenantId])).rows[0].count, 2);
  } finally {
    await db.close();
  }
});

test("local preview remains production-hidden and never enables AI", async () => {
  const route = await readFile(new URL("../src/app/preview/page.tsx", import.meta.url), "utf8");
  const proxy = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/components/workspace.tsx", import.meta.url), "utf8");
  assert.match(route, /process\.env\.NODE_ENV === "production"\) notFound\(\)/);
  assert.match(route, /aiReady=\{false\}/);
  assert.match(route, /previewMode/);
  assert.match(proxy, /const productionPreview = process\.env\.NODE_ENV === "production"/);
  assert.match(proxy, /productionPreview\s*\?/);
  assert.match(workspace, /if \(previewMode\) \{ query\.set\("view", target\); return `\/preview\?/);
  assert.match(workspace, /Local synthetic preview · read-only/);
  assert.match(workspace, /Every customer, invoice and balance is fictitious/);
});
