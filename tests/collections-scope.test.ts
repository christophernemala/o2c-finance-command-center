import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenant = id(10), entityA = id(20), entityB = id(21), customerA = id(30), customerB = id(31), user = id(1);
const insert = (db: Awaited<ReturnType<typeof migratedDatabase>>, sql: string, values: unknown[]) => db.query(sql, values);

test("NOT VALID composite customer references protect new collection/workbench writes", async () => {
  const db = await migratedDatabase();
  try {
    await insert(db, "insert into auth.users(id,email_confirmed_at) values($1,now())", [user]);
    await insert(db, "insert into public.tenants(id,name) values($1,'Scope test')", [tenant]);
    await insert(db, "insert into public.entities(id,tenant_id,name) values($1,$2,'Entity A'),($3,$2,'Entity B')", [entityA, tenant, entityB]);
    await insert(db, "insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'A-1','Customer A'),($4,$2,$5,'B-1','Customer B')",
      [customerA, tenant, entityA, customerB, entityB]);
    await insert(db, "insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,created_by) values($1,$2,$3,$4,'Contact A','a@example.com',$5),($6,$2,$7,$8,'Contact B','b@example.com',$5)",
      [id(40), tenant, entityA, customerA, user, id(41), entityB, customerB]);
    await insert(db, "insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,$4,'INV-A','2026-01-01','2026-02-01',100)",
      [id(50), tenant, entityA, customerA]);
    await insert(db, "insert into public.payment_promises(id,tenant_id,entity_id,customer_id,amount,promised_date,created_by) values($1,$2,$3,$4,10,'2026-12-01',$5)",
      [id(60), tenant, entityA, customerA, user]);

    const names = [
      "customer_contacts_customer_scope_fk", "collection_messages_customer_scope_fk", "collection_messages_contact_customer_scope_fk",
      "payment_promises_customer_scope_fk", "payment_promises_invoice_customer_scope_fk", "credit_limits_customer_scope_fk",
      "customer_holds_customer_scope_fk", "customer_remarks_customer_scope_fk", "customer_remarks_invoice_customer_scope_fk",
      "customer_remarks_promise_customer_scope_fk", "customer_trade_licences_customer_scope_fk",
    ];
    const catalog = await db.query<{ conname: string; convalidated: boolean }>(
      "select conname,convalidated from pg_constraint where conname=any($1::text[])", [names]);
    assert.equal(catalog.rows.length, names.length);
    assert.ok(catalog.rows.every(row => row.convalidated === false), "legacy rows are not scanned or rejected by this migration");

    await assert.rejects(insert(db, "insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,created_by) values($1,$2,$3,$4,'Bad','bad@example.com',$5)",
      [id(70), tenant, entityB, customerA, user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,maker) values($1,$2,$3,$4,$5,'x@example.com','reminder','Overdue','A sufficiently long message body',array[$6]::uuid[],1,$7)",
      [id(71), tenant, entityB, customerA, id(41), id(50), user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,maker) values($1,$2,$3,$4,$5,'x@example.com','reminder','Overdue','A sufficiently long message body',array[$6]::uuid[],1,$7)",
      [id(72), tenant, entityB, customerB, id(40), id(50), user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.payment_promises(id,tenant_id,entity_id,customer_id,invoice_id,amount,promised_date,created_by) values($1,$2,$3,$4,$5,10,'2026-12-01',$6)",
      [id(73), tenant, entityB, customerB, id(50), user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.credit_limits(id,tenant_id,entity_id,customer_id,credit_limit,reason,maker) values($1,$2,$3,$4,10,'Scope mismatch',$5)",
      [id(74), tenant, entityB, customerA, user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.customer_holds(id,tenant_id,entity_id,customer_id,reason,placed_by,placed_by_kind) values($1,$2,$3,$4,'Scope mismatch',$5,'human')",
      [id(75), tenant, entityB, customerA, user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.customer_remarks(id,tenant_id,entity_id,customer_id,reason,channel,note,created_by) values($1,$2,$3,$4,'other','call','Scope mismatch',$5)",
      [id(76), tenant, entityB, customerA, user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.customer_remarks(id,tenant_id,entity_id,customer_id,invoice_id,reason,channel,note,created_by) values($1,$2,$3,$4,$5,'other','call','Scope mismatch',$6)",
      [id(77), tenant, entityB, customerB, id(50), user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.customer_remarks(id,tenant_id,entity_id,customer_id,promise_id,reason,channel,note,created_by) values($1,$2,$3,$4,$5,'other','call','Scope mismatch',$6)",
      [id(78), tenant, entityB, customerB, id(60), user]), /foreign key constraint/i);
    await assert.rejects(insert(db, "insert into public.customer_trade_licences(id,tenant_id,entity_id,customer_id,licence_number,authority,expiry_date,created_by) values($1,$2,$3,$4,'L-1','DET','2027-01-01',$5)",
      [id(79), tenant, entityB, customerA, user]), /foreign key constraint/i);

    await insert(db, "insert into public.memberships values($1,$2,'viewer')", [tenant, user]);
    const token = "1".padStart(64, "0");
    await insert(db, "insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour')", [token, user]);
    await insert(db, "select set_config('o2c.session_hash',$1,false)", [token]);
    await insert(db, "select set_config('o2c.tenant_id',$1,false),set_config('o2c.entity_id',$2,false)", [tenant, entityA]);

    // Simulate rows that predate the NOT VALID constraints, then restore enforcement for new writes.
    await db.exec("alter table public.customer_contacts drop constraint customer_contacts_customer_scope_fk; alter table public.payment_promises drop constraint payment_promises_customer_scope_fk; alter table public.customer_remarks drop constraint customer_remarks_customer_scope_fk;");
    await insert(db, "insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,created_by) values($1,$2,$3,$4,'Legacy mismatch','legacy@example.com',$5)", [id(80), tenant, entityB, customerA, user]);
    await insert(db, "insert into public.payment_promises(id,tenant_id,entity_id,customer_id,amount,promised_date,created_by) values($1,$2,$3,$4,10,current_date-2,$5)", [id(81), tenant, entityB, customerA, user]);
    await insert(db, "insert into public.customer_remarks(id,tenant_id,entity_id,customer_id,reason,channel,note,next_follow_up,created_by) values($1,$2,$3,$4,'other','call','Legacy mismatch',current_date,$5)", [id(82), tenant, entityB, customerA, user]);
    await db.exec("alter table public.customer_contacts add constraint customer_contacts_customer_scope_fk foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid; alter table public.payment_promises add constraint payment_promises_customer_scope_fk foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid; alter table public.customer_remarks add constraint customer_remarks_customer_scope_fk foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;");
    await db.exec("set role authenticated");
    const worklist = (await db.query<{ v: { customer_id: string; broken_promises: number }[] }>("select public.collections_worklist($1,$2,current_date) as v", [tenant, entityA])).rows[0].v;
    assert.deepEqual(worklist.map(row => [row.customer_id, row.broken_promises]), [[customerA, 0]], "a legacy promise in another entity does not affect collection scoring");
    const account = (await db.query<{ v: { contacts: { name: string }[]; promises: unknown[] } }>("select public.customer_account($1,$2,$3,current_date) as v", [tenant, entityA, customerA])).rows[0].v;
    assert.deepEqual(account.contacts.map(row => row.name), ["Contact A"], "the valid contact remains, but the legacy contact in another entity is excluded");
    assert.equal(account.promises.length, 1, "only the valid in-scope promise appears");
    assert.deepEqual((await db.query<{ v: unknown[] }>("select public.my_follow_ups($1,$2,current_date,true) as v", [tenant, entityA])).rows[0].v, [], "a legacy follow-up in another entity is not shown");
  } finally { await db.close(); }
});
