import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PGlite } from "@electric-sql/pglite";
import { migratedDatabase } from "./pg-helper";
import { NotesView } from "../src/components/notes";
import { validateStatement } from "../src/lib/statements/pdf";
import { singleSegmentRow } from "../src/lib/segments";
import type { Snapshot } from "../src/types/workspace";
import type { AdjustmentNote } from "../src/types/collections";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20), C1 = id(30), C2 = id(31);
const A = id(40), B = id(41), C = id(42), D = id(43);

test("ledger corrections for notes, cash versus credits, promises and small fixes in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    await db.exec("set timezone='Asia/Dubai'");
    // 1 admin, 2 approver, 3 viewer, 4 maker, 5 second approver
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now()),($4,now()),($5,now())", [id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($1,$5,'maker'),($1,$6,'approver')", [T, id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$3,$4,'C1','Customer One'),($2,$3,$4,'C2','Customer Two')", [C1, C2, T, E]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values
      ($1,$5,$6,$7,'INV-A',current_date-40,current_date-10,1000.00),($2,$5,$6,$7,'INV-B',current_date-40,current_date-10,500.00),
      ($3,$5,$6,$8,'INV-C',current_date-20,current_date-5,300.00),($4,$5,$6,$8,'INV-D',current_date-10,current_date+20,200.00)`, [A, B, C, D, T, E, C1, C2]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const value = async <V>(sql: string, params: unknown[]) => (await db.query<{ v: V }>(sql, params)).rows[0].v;
    const propose = (n: number, kind: string, customer: string, invoice: string | null, amount: string, reference: string, due: string | null = null) =>
      db.query("select public.propose_adjustment_note($1,$2,$3,$4,$5,$6,$7,'pricing','Memo for the adjustment note',$8,$9::date)", [T, E, id(n), kind, customer, invoice, amount, reference, due]);
    const decide = (n: number, version: number, decision: string, reference: string | null = null) =>
      db.query("select public.decide_adjustment_note($1,$2,$3,$4,$5,$6)", [T, E, id(n), version, decision, reference]);
    const withdraw = (n: number, version: number, reason: string) => db.query("select public.withdraw_adjustment_note($1,$2,$3,$4,$5)", [T, E, id(n), version, reason]);
    const post = (n: number, version: number) => db.query("select public.post_adjustment_note($1,$2,$3,$4)", [T, E, id(n), version]);
    const note = async (n: number) => { await db.exec("reset role"); return (await db.query<{ status: string; version: number; reference: string }>("select status,version,reference from public.adjustment_notes where id=$1", [id(n)])).rows[0]; };
    const cash = async (invoice: string, amount: string, receipt: number) => {
      // Fixture: a cash allocation from a receipt, inserted without the receipt rows the triggers would check.
      await db.exec("reset role; set session_replication_role=replica");
      await db.query("insert into public.allocations(tenant_id,entity_id,invoice_id,receipt_id,approval_id,amount) values($1,$2,$3,$4,$5,$6)", [T, E, invoice, id(receipt), id(receipt + 1), amount]);
      await db.exec("set session_replication_role=origin");
    };
    const promises = async (customer: string, asOf: string) => {
      await asUser(3);
      return (await value<{ promises: { id: string; status: string }[] }>(`select public.customer_account($1,$2,$3,${asOf}) as v`, [T, E, customer])).promises;
    };

    await t.test("an approved note that cannot post is withdrawn by an independent approver, audited, and frees its reference", async () => {
      await asUser(4);
      await propose(60, "debit", C2, null, "75.00", "DN-2", "2026-12-31");
      await asUser(2);
      await decide(60, 1, "approved");
      // The ERP number is imported as a receivable before posting.
      await db.exec("reset role");
      await db.query("insert into public.invoices(tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,'DN-2',current_date,current_date+30,75.00)", [T, E, C2]);
      await asUser(4);
      await assert.rejects(post(60, 2), /already used by a receivable/);
      await assert.rejects(withdraw(60, 2, "Reference imported from the ERP"), /Forbidden/, "makers cannot withdraw");
      await asUser(3);
      await assert.rejects(withdraw(60, 2, "Reference imported from the ERP"), /Forbidden/, "viewers cannot withdraw");
      await asUser(5);
      await assert.rejects(withdraw(60, 2, "no"), /Invalid reason/);
      await assert.rejects(withdraw(60, 1, "Reference imported from the ERP"), /Only an approved, unposted note/);
      await withdraw(60, 2, "Reference imported from the ERP");
      await withdraw(60, 2, "Reference imported from the ERP");
      assert.deepEqual(await note(60), { status: "rejected", version: 3, reference: "DN-2" });
      const audit = (await db.query("select actor,detail->>'reason' as reason,detail->>'approved_by' as approved_by from public.audit_events where operation='adjustment_note.withdrawn' and record_id=$1", [id(60)])).rows;
      assert.deepEqual(audit, [{ actor: id(5), reason: "Reference imported from the ERP", approved_by: id(2) }], "one audit event; replays add none");
      await asUser(4);
      await assert.rejects(post(60, 3), /Approved current note required/);
      await asUser(2);
      await assert.rejects(decide(60, 3, "approved"), /Stale proposal/, "a withdrawn note cannot be approved again");
      await asUser(4);
      await propose(61, "debit", C2, null, "75.00", "DN-2b", "2026-12-31");
    });

    await t.test("placeholder references never post: the approver enters the ERP number", async () => {
      await asUser(4);
      await propose(62, "credit", C1, A, "200.00", "CN-pending-INV-A");
      await asUser(2);
      await assert.rejects(decide(62, 1, "approved"), /document number issued in your ERP/);
      await assert.rejects(decide(62, 1, "approved", "cn-PENDING-x"), /document number issued in your ERP/);
      const notes = await value<AdjustmentNote[]>("select public.adjustment_notes_list($1,$2,'open') as v", [T, E]);
      const html = renderToStaticMarkup(createElement(NotesView, { data: { tenant_id: T, entity_id: E, customers: [], invoices: [], role: "approver" } as unknown as Snapshot, notes, shortPayments: [], userId: id(2) }));
      assert.match(html, /Credit note number from your ERP/); assert.match(html, /The reference is a placeholder/);
      await decide(62, 1, "approved", "CN-100");
      assert.deepEqual(await note(62), { status: "approved", version: 2, reference: "CN-100" });
      const detail = (await db.query<{ d: Record<string, string> }>("select detail as d from public.audit_events where operation='adjustment_note.approved' and record_id=$1", [id(62)])).rows[0].d;
      assert.equal(detail.reference, "CN-100"); assert.equal(detail.proposed_reference, "CN-pending-INV-A");
      await asUser(4);
      await post(62, 2);
      // A placeholder note approved before this check existed is still refused at posting.
      await db.exec("reset role");
      await db.query(`insert into public.adjustment_notes(id,tenant_id,entity_id,customer_id,kind,invoice_id,invoice_version,amount,reason,memo,reference,status,maker,checker,version)
        select $1,$2,$3,$4,'credit',$5,version,10.00,'bank_charges','Legacy approved placeholder note','CN-pending-INV-B','approved',$6,$7,2 from public.invoices where id=$5`, [id(63), T, E, C1, B, id(4), id(2)]);
      await asUser(4);
      await assert.rejects(post(63, 2), /Placeholder reference/);
      await asUser(2);
      const pending = renderToStaticMarkup(createElement(NotesView, { data: { tenant_id: T, entity_id: E, customers: [], invoices: [], role: "approver" } as unknown as Snapshot,
        notes: await value<AdjustmentNote[]>("select public.adjustment_notes_list($1,$2,'open') as v", [T, E]), shortPayments: [], userId: id(2) }));
      assert.match(pending, /Withdraw approval/);
      await withdraw(63, 2, "Placeholder reference cannot post");
    });

    await t.test("statements and CEI treat credit notes as credits, not cash, and label debit notes", async () => {
      await cash(A, "300.00", 500);
      await asUser(3);
      const statement = validateStatement(await value("select public.customer_statement($1,$2,$3,current_date) as v", [T, E, C1]));
      const lineA = statement.lines.find(line => line.number === "INV-A")!;
      assert.deepEqual([lineA.gross, lineA.paid, lineA.credited, lineA.open, lineA.document_type], ["1000.00", "300.00", "200.00", "500.00", "invoice"]);
      // Beginning AR 1500 (INV-A, INV-B); credit sales 575 (INV-C, INV-D and the imported DN-2 invoice); credit notes 200;
      // ending AR 1575; ending current AR 275 (INV-D, DN-2). Cash collected = 1500 + 575 - 200 - 1575 = 300;
      // CEI = 300 / (1500 + 575 - 200 - 275) = 18.75%. Counting the credit note as cash gave 500 / 1800 = 27.78%.
      type Pack = { cei_30d_percent: string; cei_basis: Record<string, string> };
      let pack = await value<Pack>("select public.report_ar_pack($1,$2,current_date) as v", [T, E]);
      assert.equal(pack.cei_30d_percent, "18.75");
      assert.deepEqual([pack.cei_basis.credit_sales, pack.cei_basis.debit_notes, pack.cei_basis.credit_notes], ["575.00", "0", "200.00"]);
      await asUser(4);
      await propose(64, "debit", C2, null, "50.00", "DN-3", "2026-12-31");
      await asUser(2);
      await decide(64, 1, "approved");
      await asUser(4);
      await post(64, 2);
      await asUser(3);
      pack = await value<Pack>("select public.report_ar_pack($1,$2,current_date) as v", [T, E]);
      assert.deepEqual([pack.cei_basis.credit_sales, pack.cei_basis.debit_notes, pack.cei_30d_percent], ["575.00", "50.00", "18.75"], "a debit note is not a credit sale and not a collection");
      const second = validateStatement(await value("select public.customer_statement($1,$2,$3,current_date) as v", [T, E, C2]));
      assert.equal(second.lines.find(line => line.number === "DN-3")?.document_type, "debit_note");
    });

    await t.test("promises: credit notes never keep a promise; an account promise stays kept when later invoices fall due", async () => {
      await asUser(4);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,$5,'500.00',current_date+5,'Pays INV-B')", [T, E, id(90), C1, B]);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,$5,'300.00',current_date+3,'Pays INV-C')", [T, E, id(91), C2, C]);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,null,'300.00',current_date+2,'Pays what is overdue')", [T, E, id(92), C2]);
      assert.deepEqual((await promises(C1, "current_date")).map(row => row.status), ["open"]);
      // INV-B is cleared entirely by a credit note: no cash arrived, so the promise is not kept.
      await asUser(4);
      await propose(65, "credit", C1, B, "500.00", "CN-101");
      await asUser(2);
      await decide(65, 1, "approved");
      await asUser(4);
      await post(65, 2);
      assert.deepEqual((await promises(C1, "current_date")).map(row => row.status), ["cancelled"]);
      // INV-C is paid in cash: both the invoice promise and the account promise are kept ...
      await cash(C, "300.00", 510);
      const today = await promises(C2, "current_date");
      assert.deepEqual(today.map(row => [row.id, row.status]), [[id(91), "kept"], [id(92), "kept"]]);
      // ... and stay kept after INV-D (due later than the promise) becomes overdue and unpaid.
      const later = await promises(C2, "current_date+30");
      assert.deepEqual(later.map(row => [row.id, row.status]), [[id(91), "kept"], [id(92), "kept"]]);
      const worklist = await value<{ customer_id: string; broken_promises: number }[]>("select public.collections_worklist($1,$2,current_date+30) as v", [T, E]);
      assert.equal(worklist.find(row => row.customer_id === C2)?.broken_promises, 0);
    });

    await t.test("an account promise is broken while an invoice it covered is unpaid", async () => {
      await asUser(4);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,null,'500.00',current_date-1,'Pays INV-A')", [T, E, id(93), C1]);
      assert.equal((await promises(C1, "current_date")).find(row => row.id === id(93))?.status, "broken");
    });

    await t.test("an open note stays listed behind more than 100 newer closed notes", async () => {
      await db.exec("reset role");
      await db.query(`insert into public.adjustment_notes(id,tenant_id,entity_id,customer_id,kind,amount,reason,memo,reference,due_date,status,maker,created_at)
        values($1,$2,$3,$4,'debit',5.00,'other','An old note still waiting','DN-OLD',current_date+30,'pending',$5,now()-interval '1 day')`, [id(300), T, E, C2, id(4)]);
      await db.query(`insert into public.adjustment_notes(id,tenant_id,entity_id,customer_id,kind,amount,reason,memo,reference,due_date,status,maker)
        select gen_random_uuid(),$1,$2,$3,'debit',5.00,'other','Newer rejected history','DN-H'||n,current_date+30,'rejected',$4 from generate_series(1,101) n`, [T, E, C2, id(4)]);
      await asUser(3);
      const all = await value<AdjustmentNote[]>("select public.adjustment_notes_list($1,$2,'all') as v", [T, E]);
      assert.ok(all.some(row => row.id === id(300)), "the open note is listed");
      assert.equal(all.filter(row => row.status === "posted" || row.status === "rejected").length, 100, "history stays bounded");
    });

    await t.test("a run that leaves a pending collections message awaits approval", async () => {
      await db.exec("reset role");
      await db.query("insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,created_by) values($1,$2,$3,$4,'Reem','ar@one.example',$5)", [id(310), T, E, C1, id(4)]);
      await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Collections agent','queued','collections','manual',current_date)", [id(311), T, E]);
      await db.query("select o2c_private.claim_agent_run($1,$2)", [id(311), "b".repeat(64)]);
      const agent = (await db.query<{ agent_user: string }>("select agent_user from public.agent_runs where id=$1", [id(311)])).rows[0].agent_user;
      await db.query(`insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,maker,agent_run_id)
        values($1,$2,$3,$4,$5,'ar@one.example','firm','Overdue','Please pay the overdue invoices listed.',array[$6::uuid],500.00,$7,$8)`, [id(312), T, E, C1, id(310), A, agent, id(311)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", ["b".repeat(64)]);
      await db.exec("set role authenticated");
      assert.equal((await db.query<{ v: string }>("select public.agent_finish_run($1,$2,$3,'succeeded','Proposed one message',null,0,0,0,null,null) as v", [T, E, id(311)])).rows[0].v, "awaiting_approval");
    });

    await t.test("guardrails can name get_short_payment_candidates", async () => {
      await db.exec("reset role");
      await db.query("select o2c_private.check_guardrail('deny_tool',$1)", [{ tool: "get_short_payment_candidates" }]);
    });

    await t.test("trade licence replays neither archive a later renewal nor add audit events", async () => {
      await asUser(4);
      const add = (n: number, expiry: string) => db.query(`select public.add_trade_licence($1,$2,$3,$4,'TL-1','DED',${expiry})`, [T, E, id(n), C1]);
      await add(70, "current_date+10");
      await add(71, "current_date+375");
      await add(70, "current_date+10");
      await assert.rejects(add(70, "current_date+20"), /Idempotency key conflict/);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select id,archived from public.customer_trade_licences order by expiry_date")).rows, [{ id: id(70), archived: true }, { id: id(71), archived: false }]);
      assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.audit_events where operation='trade_licence.recorded'")).rows[0].n, 2);
    });

    await t.test("a single-customer segment edit keeps a blank field", async () => {
      assert.deepEqual(singleSegmentRow({ account: "C1", category: "", region: "Sharjah" }), { account: "C1", region: "Sharjah" });
      assert.deepEqual(singleSegmentRow({ account: "C1", category: "", region: "", clear_category: true }), { account: "C1", category: "" });
      await asUser(4);
      const set = (n: number, rows: unknown) => db.query("select public.set_customer_segments($1,$2,$3,$4)", [T, E, id(n), JSON.stringify(rows)]);
      await set(80, [{ account: "C1", category: "Distributor", region: "Dubai" }]);
      await set(81, [singleSegmentRow({ account: "C1", category: "", region: "Sharjah" })]);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select category,region from public.customers where id=$1", [C1])).rows[0], { category: "Distributor", region: "Sharjah" });
      await asUser(4);
      await set(82, [singleSegmentRow({ account: "C1", category: "", region: "", clear_category: true })]);
      await set(83, [{ account: "C1", category: "", region: "" }]);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select category,region from public.customers where id=$1", [C1])).rows[0], { category: null, region: null }, "CSV rows still clear with an empty cell");
    });
  } finally {
    await db.close();
  }
});

test("the one-open-message index names duplicate customers before it is built", async () => {
  const db = new PGlite();
  try {
    const dir = new URL("../postgres/migrations/", import.meta.url);
    const files = (await readdir(dir)).filter(name => name.endsWith(".sql")).sort();
    const hardening = files.findIndex(name => name.startsWith("202610160005"));
    for (const file of files.slice(0, hardening)) await db.exec(await readFile(new URL(file, dir), "utf8"));
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [id(4)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'C1','Customer One')", [C1, T, E]);
    await db.query("insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,created_by) values($1,$2,$3,$4,'Reem','ar@one.example',$5)", [id(60), T, E, C1, id(4)]);
    for (const [n, status] of [[70, "pending"], [71, "approved"]] as const)
      await db.query(`insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,status,maker)
        values($1,$2,$3,$4,$5,'ar@one.example','firm','Overdue','Please pay the overdue invoices listed.',array[$6::uuid],10.00,$7,$8)`, [id(n), T, E, C1, id(60), A, status, id(4)]);
    await assert.rejects(db.exec(await readFile(new URL(files[hardening], dir), "utf8")), new RegExp(`one open collections message per customer.*${C1} \\(2\\)`));
  } finally {
    await db.close();
  }
});
