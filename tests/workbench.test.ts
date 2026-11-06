import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20), C1 = id(30), C2 = id(31), C3 = id(32);

test("collections workbench in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    // Business dates are Dubai dates; align current_date with them so the test is stable near midnight UTC.
    await db.exec("set timezone='Asia/Dubai'");
    // 1 admin, 2 approver, 3 viewer, 4 maker, 6 maker in another tenant
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now()),($4,now()),($5,now())", [id(1), id(2), id(3), id(4), id(6)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant'),($2,'Other')", [T, id(11)]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($1,$5,'maker'),($6,$7,'maker')", [T, id(1), id(2), id(3), id(4), id(11), id(6)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity'),($3,$4,'Other entity')", [E, T, id(21), id(11)]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$4,$5,'C1','Customer One'),($2,$4,$5,'C2','Customer Two'),($3,$4,$5,'C3','Customer Three')", [C1, C2, C3, T, E]);
    // C1: 1000.00 overdue 100 days. C2: 2000.00 overdue 10 days. C3: not yet due.
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross,dispute) values
      ($1,$4,$5,$6,'INV-1',current_date-130,current_date-100,1000.00,'none'),($2,$4,$5,$7,'INV-2',current_date-40,current_date-10,2000.00,'none'),
      ($3,$4,$5,$8,'INV-3',current_date-5,current_date+25,500.00,'none')`, [id(40), id(41), id(42), T, E, C1, C2, C3]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const value = async <V = unknown>(sql: string, values: unknown[]) => (await db.query<{ v: V }>(sql, values)).rows[0].v;

    await t.test("call list ranks by overdue amount weighted by age; score parts are shown", async () => {
      await asUser(3);
      const list = await value<Record<string, unknown>[]>("select public.daily_call_list($1,$2,current_date,10) as v", [T, E]);
      // C1: 1000*(1+100/90)=2111.11; C2: 2000*(1+10/90)=2222.22. Not-yet-due C3 is excluded.
      assert.deepEqual(list.map(r => [r.account, r.score, r.oldest_days]), [["C2", "2222.22", 10], ["C1", "2111.11", 100]]);
      assert.equal(list[0].why, "10 days overdue · no contact on file");
      await assert.rejects(db.query("select public.daily_call_list($1,$2,current_date,0)", [T, E]), /Invalid request/);
      await asUser(6);
      await assert.rejects(db.query("select public.daily_call_list($1,$2,current_date,10)", [T, E]), /Forbidden|scope/i, "another tenant cannot read the list");
    });

    await t.test("remarks: viewers cannot add; a promise remark creates the promise in the same transaction", async () => {
      await asUser(3);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,null,'no_answer','call','Called twice',null,null,null)", [T, E, id(50), C1]), /Forbidden/);
      await asUser(4);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,null,'promised','call','Will pay Friday',null,null,null)", [T, E, id(50), C1]), /amount and a date/);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,null,'promised','call','Will pay Friday',null,'12.345',current_date+3)", [T, E, id(50), C1]), /amount and a date/);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,null,'no_answer','call','Called',current_date-1,null,null)", [T, E, id(50), C1]), /within the next year/);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,$5,'no_answer','call','Wrong invoice',null,null,null)", [T, E, id(50), C1, id(41)]), /Customer unavailable/);
      await db.query("select public.add_customer_remark($1,$2,$3,$4,$5,'promised','call','Will pay INV-1 Friday',current_date+3,'1000.00',current_date+3)", [T, E, id(50), C1, id(40)]);
      await db.query("select public.add_customer_remark($1,$2,$3,$4,$5,'promised','call','Will pay INV-1 Friday',current_date+3,'1000.00',current_date+3)", [T, E, id(50), C1, id(40)]);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,null,'other','call','Different note',null,null,null)", [T, E, id(50), C1]), /Idempotency key conflict/);
      await asUser(2);
      await assert.rejects(db.query("select public.add_customer_remark($1,$2,$3,$4,null,'promised','call','Approver records promise',null,'5.00',current_date+3)", [T, E, id(51), C2]), /Forbidden/, "approvers note calls but do not record promises");
      await db.query("select public.add_customer_remark($1,$2,$3,$4,null,'no_answer','call','No answer on mobile',null,null,null)", [T, E, id(51), C2]);
      await db.exec("reset role");
      const promise = (await db.query<{ amount: string; n: number }>("select p.amount::text as amount,(select count(*)::int from public.payment_promises) as n from public.customer_remarks r join public.payment_promises p on p.id=r.promise_id where r.id=$1", [id(50)])).rows[0];
      assert.deepEqual(promise, { amount: "1000.00", n: 1 }, "one promise, even after the retried call");
      assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.audit_events where operation='remark.added'")).rows[0].n, 2);
      await assert.rejects(db.query("update public.customer_remarks set note='edited' where id=$1", [id(50)]), /append-only|immutable|not allowed/i);
    });

    await t.test("customers with a future follow-up or a remark today drop off the call list", async () => {
      await asUser(3);
      const list = await value<Record<string, unknown>[]>("select public.daily_call_list($1,$2,current_date,10) as v", [T, E]);
      assert.deepEqual(list, [], "C1 has a follow-up in three days; C2 was called today");
      const later = await value<Record<string, unknown>[]>("select public.daily_call_list($1,$2,current_date+3,10) as v", [T, E]);
      assert.deepEqual(later.map(r => [r.account, r.last_note]), [["C2", "No answer on mobile"], ["C1", "Will pay INV-1 Friday"]]);
    });

    await t.test("follow-ups due: mine by default, everyone's on request", async () => {
      await asUser(4);
      assert.deepEqual(await value("select public.my_follow_ups($1,$2,current_date,false) as v", [T, E]), []);
      const due = await value<Record<string, unknown>[]>("select public.my_follow_ups($1,$2,current_date+4,false) as v", [T, E]);
      assert.deepEqual(due.map(r => [r.account, r.days_late, r.last_reason]), [["C1", 1, "promised"]]);
      await asUser(2);
      assert.deepEqual(await value("select public.my_follow_ups($1,$2,current_date+4,false) as v", [T, E]), [], "the approver set no follow-ups");
      assert.equal((await value<unknown[]>("select public.my_follow_ups($1,$2,current_date+4,true) as v", [T, E])).length, 1);
      const remarks = await value<{ remarks: { reason: string }[] }>("select public.customer_remarks_list($1,$2,$3) as v", [T, E, C1]);
      assert.deepEqual(remarks.remarks.map(r => r.reason), ["promised"]);
    });

    await t.test("trade licences: makers record them, renewals archive the old record, alerts use the window", async () => {
      await asUser(2);
      await assert.rejects(db.query("select public.add_trade_licence($1,$2,$3,$4,'CN-1','DED',current_date+10)", [T, E, id(60), C1]), /Forbidden/);
      await asUser(4);
      await db.query("select public.add_trade_licence($1,$2,$3,$4,'CN-1','DED',current_date+10)", [T, E, id(60), C1]);
      await db.query("select public.add_trade_licence($1,$2,$3,$4,'CN-2','DMCC',current_date-2)", [T, E, id(61), C2]);
      const alerts = await value<Record<string, unknown>[]>("select public.licence_alerts($1,$2,current_date,30) as v", [T, E]);
      assert.deepEqual(alerts.map(r => [r.licence_number, r.days_left, r.expired]), [["CN-2", -2, true], ["CN-1", 10, false]]);
      await db.query("select public.add_trade_licence($1,$2,$3,$4,'CN-1','DED',current_date+375)", [T, E, id(62), C1]);
      const renewed = await value<Record<string, unknown>[]>("select public.licence_alerts($1,$2,current_date,30) as v", [T, E]);
      assert.deepEqual(renewed.map(r => r.licence_number), ["CN-2"], "the renewed licence is outside the window");
      const account = await value<{ licences: { id: string }[] }>("select public.customer_remarks_list($1,$2,$3) as v", [T, E, C1]);
      assert.deepEqual(account.licences.map(l => l.id), [id(62)]);
      await assert.rejects(db.query("select public.licence_alerts($1,$2,current_date,400)", [T, E]), /Invalid window/);
    });

    await t.test("direct table writes are refused; reads are tenant-scoped", async () => {
      await asUser(4);
      await assert.rejects(db.query("insert into public.customer_remarks(id,tenant_id,entity_id,customer_id,reason,channel,note,created_by) values($1,$2,$3,$4,'other','call','direct',$5)", [id(70), T, E, C1, id(4)]), /permission denied/);
      await asUser(6);
      assert.equal((await db.query("select * from public.customer_remarks")).rows.length, 0);
      assert.equal((await db.query("select * from public.customer_trade_licences")).rows.length, 0);
    });
  } finally {
    await db.close();
  }
});
