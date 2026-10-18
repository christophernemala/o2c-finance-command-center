import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { migratedDatabase } from "./pg-helper";
import { deliverApproved } from "../src/lib/collections/send";
import { emailConfig, resendSender, type Sender } from "../src/lib/email/resend";
import { statementPdf, validateStatement } from "../src/lib/statements/pdf";
import type { SqlPool } from "../src/lib/postgres/transaction";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20), C1 = id(30), C2 = id(31);

test("collections and credit controls in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    await db.exec("create role o2c_runtime login nosuperuser nobypassrls; grant o2c_app to o2c_runtime;");
    // 1 admin, 2 approver, 3 viewer, 4 maker, 5 second approver
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now()),($4,now()),($5,now())", [id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($1,$5,'maker'),($1,$6,'approver')", [T, id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$3,$4,'C1','Customer One'),($2,$3,$4,'C2','Customer Two')", [C1, C2, T, E]);
    // Two overdue invoices for C1 (one disputed), one not yet due; one overdue for C2. Dates are relative to the Dubai date.
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross,dispute) values
      ($1,$5,$6,$7,'INV-1',current_date-100,current_date-70,1200.50,'none'),($2,$5,$6,$7,'INV-2',current_date-60,current_date-30,800.25,'open'),
      ($3,$5,$6,$7,'INV-3',current_date-5,current_date+25,300.00,'none'),($4,$5,$6,$8,'INV-4',current_date-50,current_date-20,999.99,'none')`,
      [id(40), id(41), id(42), id(43), T, E, C1, C2]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const value = async <V = unknown>(sql: string, values: unknown[]) => (await db.query<{ v: V }>(sql, values)).rows[0].v;
    const CONTACT = id(60), MSG = id(70);

    await t.test("contacts: makers add them; viewers cannot; emails are validated", async () => {
      await asUser(3);
      await assert.rejects(db.query("select public.add_customer_contact($1,$2,$3,$4,'Reem','ar@one.example','ar',true)", [T, E, CONTACT, C1]), /Forbidden/);
      await asUser(4);
      await assert.rejects(db.query("select public.add_customer_contact($1,$2,$3,$4,'Reem','not-an-email','ar',true)", [T, E, CONTACT, C1]), /check/);
      await db.query("select public.add_customer_contact($1,$2,$3,$4,'Reem','AR@One.example','ar',true)", [T, E, CONTACT, C1]);
      assert.equal((await db.query<{ email: string }>("select email from public.customer_contacts where id=$1", [CONTACT])).rows[0].email, "ar@one.example");
    });

    await t.test("a message needs a contact and overdue undisputed invoices; the total comes from the ledger", async () => {
      await asUser(4);
      await assert.rejects(db.query("select public.propose_collection_message($1,$2,$3,$4,$5,'firm','Overdue','Please pay the overdue invoices listed.',$6,false)", [T, E, id(71), C2, CONTACT, [id(43)]]), /Contact required/);
      await assert.rejects(db.query("select public.propose_collection_message($1,$2,$3,$4,$5,'firm','Overdue','Please pay the overdue invoices listed.',$6,false)", [T, E, id(71), C1, CONTACT, [id(40), id(41)]]), /overdue, undisputed/);
      await assert.rejects(db.query("select public.propose_collection_message($1,$2,$3,$4,$5,'firm','Overdue','Please pay the overdue invoices listed.',$6,false)", [T, E, id(71), C1, CONTACT, [id(42)]]), /overdue, undisputed/);
      const proposed = await value<Record<string, string>>("select public.propose_collection_message($1,$2,$3,$4,$5,'firm','Overdue','Please pay the overdue invoices listed.',$6,true) as v", [T, E, MSG, C1, CONTACT, [id(40)]]);
      assert.deepEqual([proposed.status, proposed.total_overdue, proposed.to], ["pending", "1200.50", "ar@one.example"]);
      await assert.rejects(db.query("select public.decide_collection_message($1,$2,$3,'approved')", [T, E, MSG]), /Forbidden/, "makers cannot approve");
      await asUser(1);
      await assert.rejects(db.query("select public.decide_collection_message($1,$2,$3,'approved')", [T, E, id(999)]), /Independent checker/);
      await asUser(2);
      await db.query("select public.decide_collection_message($1,$2,$3,'approved')", [T, E, MSG]);
    });

    const pool: SqlPool = { connect: async () => { await db.exec("reset role; set role o2c_runtime"); return { query: (sql: string, values?: unknown[]) => db.query(sql, values) as never, release: () => {} }; } };
    await t.test("delivery claims once, retries a failed send up to three attempts, and never resends a sent message", async () => {
      const failing: Sender = async () => ({ ok: false, error: "Resend 500: unavailable" });
      for (const attempt of [1, 2]) {
        assert.deepEqual(await deliverApproved(pool, failing), { claimed: 1, sent: 0, failed: 1, configured: true });
        await db.exec("reset role");
        assert.deepEqual((await db.query("select status,attempts from public.collection_messages where id=$1", [MSG])).rows[0], { status: "approved", attempts: attempt });
      }
      assert.deepEqual(await deliverApproved(pool, null), { claimed: 0, sent: 0, failed: 0, configured: false }, "not configured: nothing claimed or simulated");
      const sends: { to: string; key: string; attachments: number; pdf: string }[] = [];
      const ok: Sender = async (message, key) => { sends.push({ to: message.to, key, attachments: message.attachments?.length ?? 0, pdf: Buffer.from(message.attachments?.[0].content ?? []).subarray(0, 5).toString() }); return { ok: true, id: "re_123" }; };
      assert.deepEqual(await deliverApproved(pool, ok), { claimed: 1, sent: 1, failed: 0, configured: true });
      assert.deepEqual(sends, [{ to: "ar@one.example", key: MSG, attachments: 1, pdf: "%PDF-" }], "message id is the idempotency key; statement attached");
      await db.exec("reset role");
      assert.deepEqual((await db.query("select status,attempts,provider_id from public.collection_messages where id=$1", [MSG])).rows[0], { status: "sent", attempts: 3, provider_id: "re_123" });
      assert.equal((await deliverApproved(pool, ok)).claimed, 0, "a sent message is never claimed again");
      await asUser(4);
      await db.query("select public.propose_collection_message($1,$2,$3,$4,$5,'reminder','Reminder','A second reminder about the overdue invoice.',$6,false)", [T, E, id(72), C1, CONTACT, [id(40)]]);
      await asUser(2);
      await db.query("select public.decide_collection_message($1,$2,$3,'approved')", [T, E, id(72)]);
      for (let attempt = 0; attempt < 3; attempt++) await deliverApproved(pool, failing);
      await db.exec("reset role");
      assert.deepEqual((await db.query("select status,attempts,error from public.collection_messages where id=$1", [id(72)])).rows[0], { status: "failed", attempts: 3, error: "Resend 500: unavailable" });
      assert.equal((await deliverApproved(pool, ok)).claimed, 0, "a failed message is not retried after three attempts");
    });

    await t.test("credit holds: an agent may place one; only a different human approver releases it", async () => {
      await db.exec("reset role");
      await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Credit risk agent','queued','credit_risk','manual',current_date)", [id(100), T, E]);
      await db.query("select o2c_private.claim_agent_run($1,$2)", [id(100), "a".repeat(64)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", ["a".repeat(64)]);
      await db.exec("set role authenticated");
      await db.query("select public.place_customer_hold($1,$2,$3,$4,'INV-4 is 20 days overdue')", [T, E, id(80), C2]);
      await assert.rejects(db.query("select public.release_customer_hold($1,$2,$3,'agent tries')", [T, E, id(80)]), /Forbidden/);
      await asUser(4);
      await assert.rejects(db.query("select public.release_customer_hold($1,$2,$3,'maker tries')", [T, E, id(80)]), /Forbidden/);
      await asUser(2);
      await db.query("select public.release_customer_hold($1,$2,$3,'Customer paid INV-4')", [T, E, id(80)]);
      await db.query("select public.place_customer_hold($1,$2,$3,$4,'Placed by approver two')", [T, E, id(81), C2]);
      await assert.rejects(db.query("select public.release_customer_hold($1,$2,$3,'own hold')", [T, E, id(81)]), /Independent checker/);
      await asUser(5);
      await db.query("select public.release_customer_hold($1,$2,$3,'Second approver releases')", [T, E, id(81)]);
      await db.exec("reset role");
      const holds = (await db.query<{ placed_by_kind: string; released: boolean }>("select placed_by_kind,released_at is not null as released from public.customer_holds order by placed_at,id")).rows;
      assert.deepEqual(holds, [{ placed_by_kind: "agent", released: true }, { placed_by_kind: "human", released: true }]);
    });

    await t.test("credit limits need an independent checker", async () => {
      await asUser(4);
      await db.query("select public.propose_credit_limit($1,$2,$3,$4,'1500.00','Twelve months on time')", [T, E, id(90), C1]);
      await asUser(1);
      await db.query("select public.propose_credit_limit($1,$2,$3,$4,'2000.00','Admin proposal')", [T, E, id(91), C2]);
      await assert.rejects(db.query("select public.decide_credit_limit($1,$2,$3,'active')", [T, E, id(91)]), /Independent checker/);
      await db.query("select public.decide_credit_limit($1,$2,$3,'active')", [T, E, id(90)]);
    });

    await t.test("worklist, account and statement read the ledger; broken promises are derived", async () => {
      await asUser(4);
      await db.query("select public.record_payment_promise($1,$2,$3,$4,$5,'500.00',current_date-1,'Promised on call')", [T, E, id(95), C1, id(40)]);
      await asUser(3);
      const worklist = await value<Record<string, unknown>[]>("select public.collections_worklist($1,$2,current_date) as v", [T, E]);
      assert.deepEqual(worklist.map(row => [row.customer, row.overdue, row.broken_promises, row.credit_limit, row.last_message, row.disputed_invoices]),
        [["Customer One", "2000.75", 1, "1500.00", "failed", 1], ["Customer Two", "999.99", 0, null, null, 0]]);
      const account = await value<{ promises: { status: string }[]; invoices: unknown[]; hold: unknown }>("select public.customer_account($1,$2,$3,current_date) as v", [T, E, C1]);
      assert.equal(account.promises[0].status, "broken"); assert.equal(account.invoices.length, 3); assert.equal(account.hold, null);
      const statement = validateStatement(await value("select public.customer_statement($1,$2,$3,current_date) as v", [T, E, C1]));
      assert.deepEqual([statement.total_open, statement.total_overdue, statement.lines.length], ["2300.75", "2000.75", 3]);
      const pdf = await PDFDocument.load(await statementPdf(statement));
      assert.equal(pdf.getPageCount(), 1); assert.match(pdf.getTitle() ?? "", /C1/);
    });
  } finally { await db.close(); }
});

test("Resend sender: idempotency key, attachment encoding and failure reporting", async () => {
  assert.equal(emailConfig({ RESEND_API_KEY: "k" }), null, "a from address is required");
  assert.equal(emailConfig({ RESEND_API_KEY: "k", COLLECTIONS_FROM: "not an address" }), null);
  const config = emailConfig({ RESEND_API_KEY: "re_test", COLLECTIONS_FROM: "Accounts Receivable <ar@example.com>" })!;
  let seen: { url: string; init: RequestInit } | null = null;
  const send = resendSender(config, (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: "re_1" }), { status: 200 }); }) as never);
  assert.deepEqual(await send({ to: "x@example.com", subject: "S", text: "Body", attachments: [{ filename: "a.pdf", content: new Uint8Array([37, 80, 68, 70]) }] }, "key-1"), { ok: true, id: "re_1" });
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(seen!.url, "https://api.resend.com/emails"); assert.equal(headers["Idempotency-Key"], "key-1"); assert.equal(headers.Authorization, "Bearer re_test");
  assert.equal(JSON.parse(String(seen!.init.body)).attachments[0].content, "JVBERg==");
  const failing = resendSender(config, (async () => new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 })) as never);
  assert.deepEqual(await failing({ to: "x@example.com", subject: "S", text: "B" }, "k"), { ok: false, error: "Resend 403: Domain not verified" });
});
