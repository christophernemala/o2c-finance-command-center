import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";
import { deliverApproved } from "../src/lib/collections/send";
import type { Sender } from "../src/lib/email/resend";
import type { SqlPool } from "../src/lib/postgres/transaction";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20), C1 = id(30), C2 = id(31), K1 = id(60), K2 = id(61);
const body = "Please pay the overdue invoices listed below.";

test("collections hardening in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    await db.exec("set timezone='Asia/Dubai'");
    await db.exec("create role o2c_runtime login nosuperuser nobypassrls; grant o2c_app to o2c_runtime;");
    // 1 admin, 2 approver, 4 maker
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())", [id(1), id(2), id(4)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'maker')", [T, id(1), id(2), id(4)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$3,$4,'C1','Customer One'),($2,$3,$4,'C2','Customer Two')", [C1, C2, T, E]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross,dispute) values
      ($1,$4,$5,$6,'INV-1',current_date-100,current_date-70,1200.50,'none'),($2,$4,$5,$6,'INV-2',current_date-60,current_date-30,800.25,'none'),
      ($3,$4,$5,$7,'INV-3',current_date-50,current_date-20,999.99,'none')`, [id(40), id(41), id(42), T, E, C1, C2]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const propose = (msg: number, customer: string, contact: string, invoices: string[]) =>
      db.query("select public.propose_collection_message($1,$2,$3,$4,$5,'firm','Overdue',$6,$7,true)", [T, E, id(msg), customer, contact, body, invoices]);
    const decide = (msg: number) => db.query("select public.decide_collection_message($1,$2,$3,'approved')", [T, E, id(msg)]);
    const status = async (msg: number) => { await db.exec("reset role"); return (await db.query<{ status: string; error: string | null }>("select status,error from public.collection_messages where id=$1", [id(msg)])).rows[0]; };
    const pool: SqlPool = { connect: async () => { await db.exec("reset role; set role o2c_runtime"); return { query: (sql: string, values?: unknown[]) => db.query(sql, values) as never, release: () => {} }; } };

    await asUser(4);
    await db.query("select public.add_customer_contact($1,$2,$3,$4,'Reem','ar@one.example','ar',true)", [T, E, K1, C1]);
    await db.query("select public.add_customer_contact($1,$2,$3,$4,'Omar','ar@two.example','ar',true)", [T, E, K2, C2]);

    await t.test("one open message per customer", async () => {
      await asUser(4);
      await propose(70, C1, K1, [id(40)]);
      await assert.rejects(propose(71, C1, K1, [id(41)]), /already has a message awaiting approval/);
    });

    await t.test("a message whose invoice was disputed after drafting cannot be approved", async () => {
      await db.exec("reset role");
      await db.query("update public.invoices set dispute='open' where id=$1", [id(40)]);
      await asUser(2);
      await assert.rejects(decide(70), /Stale evidence/);
      await db.query("select public.decide_collection_message($1,$2,$3,'rejected')", [T, E, id(70)]);
      await db.exec("reset role");
      await db.query("update public.invoices set dispute='none' where id=$1", [id(40)]);
    });

    await t.test("an approved message whose invoice changes before sending fails instead of being sent", async () => {
      await asUser(4);
      await propose(72, C1, K1, [id(40), id(41)]);
      await asUser(2);
      await decide(72);
      await db.exec("reset role");
      await db.query("update public.invoices set dispute='open' where id=$1", [id(41)]);
      const sends: string[] = [];
      const ok: Sender = async (_message, key) => { sends.push(key); return { ok: true, id: "re_1" }; };
      assert.deepEqual(await deliverApproved(pool, ok), { claimed: 0, sent: 0, failed: 0, configured: true });
      assert.deepEqual(sends, []);
      assert.match((await status(72)).error ?? "", /Stale evidence at send time/);
      assert.equal((await status(72)).status, "failed");
      await db.query("update public.invoices set dispute='none' where id=$1", [id(41)]);
    });

    await t.test("the attached statement lists only the approved invoices; completion must match the claimed attempt", async () => {
      await asUser(4);
      await propose(73, C1, K1, [id(41)]);
      await asUser(2);
      await decide(73);
      await db.exec("reset role; set role o2c_runtime");
      const claimed = (await db.query<{ v: { id: string; attempts: number }[] }>("select o2c_private.claim_collection_messages(5) as v")).rows[0].v;
      assert.deepEqual(claimed.map(row => [row.id, row.attempts]), [[id(73), 1]]);
      const statement = (await db.query<{ v: { lines: { number: string }[]; total_open: string } }>("select o2c_private.message_statement($1) as v", [id(73)])).rows[0].v;
      assert.deepEqual([statement.lines.map(line => line.number), statement.total_open], [["INV-2"], "800.25"]);
      await assert.rejects(db.query("select o2c_private.complete_collection_message($1,2,true,'re_late',null)", [id(73)]), /not sending/, "a wrong attempt number is refused");
      await db.query("select o2c_private.complete_collection_message($1,1,true,'re_2',null)", [id(73)]);
      assert.equal((await status(73)).status, "sent");
    });

    await t.test("a sender that dies on the final attempt leaves a failed message, not one stuck in sending", async () => {
      await asUser(4);
      await propose(74, C2, K2, [id(42)]);
      await asUser(2);
      await decide(74);
      await db.exec("reset role");
      await db.query("update public.collection_messages set status='sending',attempts=3,sending_at=now()-interval '20 minutes' where id=$1", [id(74)]);
      await db.exec("set role o2c_runtime");
      await db.query("select o2c_private.claim_collection_messages(5)");
      assert.deepEqual(await status(74), { status: "failed", error: "Sender stopped during the final attempt" });
    });

    await t.test("archiving a contact withdraws its queued messages", async () => {
      await asUser(4);
      await propose(75, C2, K2, [id(42)]);
      await db.query("select public.archive_customer_contact($1,$2,$3)", [T, E, K2]);
      assert.deepEqual(await status(75), { status: "rejected", error: "Contact removed before sending" });
    });

    await t.test("block-stage deny rules stop the agent's message and hold routines on direct RPC", async () => {
      await asUser(1);
      for (const [n, tool] of [[200, "place_credit_hold"], [201, "propose_collection_message"]] as const) {
        await db.query("select public.propose_guardrail($1,$2,$3,$4,'deny_tool','collections',$5,null)", [T, E, id(n), `Deny ${tool}`, { tool }]);
        await db.query("select public.propose_guardrail_stage($1,$2,$3,2,'block',null)", [T, E, id(n)]);
      }
      await asUser(2);
      for (const n of [200, 201]) await db.query("select public.decide_guardrail_stage($1,$2,$3,2,'active')", [T, E, id(n)]);
      await db.exec("reset role");
      await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Collections agent','queued','collections','manual',current_date)", [id(100), T, E]);
      await db.query("select o2c_private.claim_agent_run($1,$2)", [id(100), "a".repeat(64)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", ["a".repeat(64)]);
      await db.exec("set role authenticated");
      await assert.rejects(db.query("select public.place_customer_hold($1,$2,$3,$4,'Agent hold')", [T, E, id(80), C1]), /Blocked by guardrail: Deny place_credit_hold/);
      await assert.rejects(propose(76, C1, K1, [id(40)]), /Blocked by guardrail: Deny propose_collection_message/);
      await asUser(4);
      await db.query("select public.place_customer_hold($1,$2,$3,$4,'Human hold is unaffected')", [T, E, id(81), C1]);
    });

    await t.test("promises: kept from the ledger or by a person, never counted as broken once kept", async () => {
      await asUser(4);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,$5,'800.25',current_date-2,'Pays INV-2')", [T, E, id(90), C1, id(41)]);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,$5,'800.25',current_date-2,'Pays INV-2')", [T, E, id(90), C1, id(41)]);
      await assert.rejects(db.query("select public.record_payment_promise($1,$2,$3,$4,$5,'1.00',current_date-2,'Different')", [T, E, id(90), C1, id(41)]), /Idempotency key conflict/);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,null,'100.00',current_date-1,'Account promise')", [T, E, id(91), C1]);
      const broken = async () => (await db.query<{ v: { customer_id: string; broken_promises: number }[] }>("select public.collections_worklist($1,$2,current_date) as v", [T, E])).rows[0].v.find(row => row.customer_id === C1)?.broken_promises;
      assert.equal(await broken(), 2);
      // INV-2 paid in full: the invoice promise becomes kept from the ledger.
      await db.exec("reset role; set session_replication_role=replica");
      await db.query("insert into public.allocations(tenant_id,entity_id,invoice_id,receipt_id,approval_id,amount) values($1,$2,$3,$4,$5,800.25)", [T, E, id(41), id(500), id(501)]);
      await db.exec("set session_replication_role=origin");
      await asUser(4);
      assert.equal(await broken(), 1);
      const promises = (await db.query<{ v: { promises: { id: string; status: string }[] } }>("select public.customer_account($1,$2,$3,current_date) as v", [T, E, C1])).rows[0].v.promises;
      assert.deepEqual(promises.map(row => [row.id, row.status]), [[id(91), "broken"], [id(90), "kept"]]);
      await assert.rejects(db.query("select public.resolve_payment_promise($1,$2,$3,'kept','')", [T, E, id(91)]), /Invalid resolution/);
      await db.query("select public.resolve_payment_promise($1,$2,$3,'kept','Paid by cheque 1234')", [T, E, id(91)]);
      assert.equal(await broken(), 0);
      await db.exec("reset role");
      const audits = (await db.query<{ operation: string; n: number }>("select operation,count(*)::int as n from public.audit_events where operation like 'promise.%' group by operation order by operation")).rows;
      assert.deepEqual(audits, [{ operation: "promise.kept", n: 1 }, { operation: "promise.recorded", n: 2 }], "replays add no audit events");
    });
  } finally {
    await db.close();
  }
});
