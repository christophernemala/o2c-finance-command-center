import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";
import { transaction, type SqlPool } from "../src/lib/postgres/transaction";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function asPool(db: Awaited<ReturnType<typeof migratedDatabase>>, role: string): SqlPool {
  return {
    async connect() {
      await db.exec(`reset role; set role ${role}`);
      return {
        query: (text, values) => db.query(text, values),
        release: () => {},
      };
    },
  };
}

test("FORCE RLS applies to a finance-table owner while preserving tenant entity switching", async () => {
  const db = await migratedDatabase();
  try {
    const uncovered = await db.query<{ n: number }>(`select count(*)::int as n from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')
      and (not c.relrowsecurity or not c.relforcerowsecurity)`);
    assert.equal(uncovered.rows[0].n, 0, "every public table has enabled and forced RLS");

    const T = id(110), T2 = id(111), E1 = id(120), E2 = id(121), E3 = id(122);
    const C1 = id(130), C2 = id(131), C3 = id(132), U = id(140), token = "f".repeat(64);
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [U]);
    await db.query("insert into public.tenants(id,name) values($1,'Selected-entity tenant'),($2,'No-membership tenant')", [T,T2]);
    await db.query("insert into public.memberships(tenant_id,user_id,role) values($1,$2,'maker')", [T,U]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$3,'Entity A'),($2,$3,'Entity B'),($4,$5,'Other tenant')", [E1,E2,T,E3,T2]);
    await db.query(`insert into public.customers(id,tenant_id,entity_id,account,name) values
      ($1,$4,$5,'A-1','Customer A'),($2,$4,$6,'B-1','Customer B'),($3,$7,$8,'X-1','Other tenant customer')`, [C1,C2,C3,T,E1,E2,T2,E3]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values
      ($1,$4,$5,$6,'INV-A',current_date-20,current_date+10,100.00),
      ($2,$4,$7,$8,'INV-B',current_date-20,current_date+10,200.00),
      ($3,$9,$10,$11,'INV-X',current_date-20,current_date+10,300.00)`, [id(150),id(151),id(152),T,E1,C1,E2,C2,T2,E3,C3]);
    await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour')", [token,U]);
    await db.query("select set_config('o2c.session_hash',$1,false)", [token]);
    await db.query("select set_config('o2c.tenant_id',$1,false),set_config('o2c.entity_id',$2,false)", [T,E1]);
    await db.exec("create role finance_table_owner nologin; grant authenticated to finance_table_owner; alter table public.invoices owner to finance_table_owner; set role finance_table_owner");

    const entityList = await db.query<{ id: string }>("select id from public.entities order by id");
    assert.deepEqual(entityList.rows.map(row => row.id), [E1,E2], "a tenant member can still see both entities to switch between them");
    const selectedA = await db.query<{ number: string }>("select number from public.invoices order by number");
    assert.deepEqual(selectedA.rows.map(row => row.number), ["INV-A"], "table ownership cannot reveal the other entity's finance rows");

    await db.query("select set_config('o2c.entity_id',$1,false)", [E2]);
    const selectedB = await db.query<{ number: string }>("select number from public.invoices order by number");
    assert.deepEqual(selectedB.rows.map(row => row.number), ["INV-B"], "the same membership can explicitly switch entity scope");
    const switchedEntities = await db.query<{ id: string }>("select id from public.entities order by id");
    assert.deepEqual(switchedEntities.rows.map(row => row.id), [E1,E2]);

    await db.query("select set_config('o2c.entity_id',$1,false)", [""]);
    assert.equal((await db.query("select id from public.invoices")).rows.length, 0, "no selected entity means no finance rows");
    await db.query("select set_config('o2c.tenant_id',$1,false),set_config('o2c.entity_id',$2,false)", [T2,E3]);
    assert.equal((await db.query("select id from public.invoices")).rows.length, 0, "a tenant without membership stays invisible even to the table owner");
    assert.equal((await db.query("select id from public.entities")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("application runtime refuses membership in the BYPASSRLS worker role", async () => {
  const db = await migratedDatabase();
  try {
    await db.exec("create role security_runtime login nosuperuser nobypassrls; grant o2c_app to security_runtime");
    const pool = asPool(db, "security_runtime");
    assert.equal(await transaction(pool, async connection => (await connection.query<{ user_name: string }>("select current_user as user_name")).rows[0].user_name), "security_runtime");

    await db.exec("reset role; grant o2c_worker to security_runtime");
    await assert.rejects(transaction(pool, async () => "must not run"), /non-owner database application role/);
  } finally {
    await db.close();
  }
});
