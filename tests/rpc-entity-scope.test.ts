import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E1 = id(20), E2 = id(21), C1 = id(30), C2 = id(31), U = id(1);

test("authenticated definer RPCs reject tenant-member calls that mismatch selected entity scope", async () => {
  const db = await migratedDatabase();
  try {
    await db.exec("set timezone='Asia/Dubai'");
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [U]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'maker')", [T, U]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$3,'Entity A'),($2,$3,'Entity B')", [E1, E2, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$3,$4,'A','Customer A'),($2,$3,$5,'B','Customer B')", [C1, C2, T, E1, E2]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross,dispute) values
      ($1,$3,$4,$5,'INV-A',current_date-60,current_date-30,250.00,'none'),
      ($2,$3,$6,$7,'INV-B',current_date-60,current_date-30,900.00,'none')`, [id(40), id(41), T, E1, C1, E2, C2]);
    await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour')", [hash(1), U]);
    await db.query("select set_config('o2c.session_hash',$1,false)", [hash(1)]);
    await db.query("select set_config('o2c.tenant_id',$1,false),set_config('o2c.entity_id',$2,false)", [T, E1]);
    await db.exec("set role authenticated");

    const ownScope = await db.query<{ value: unknown }>("select public.agent_ar_overview($1,$2,current_date) as value", [T, E1]);
    assert.ok(ownScope.rows[0].value, "same-entity definer read remains usable");
    const visibleRows = await db.query("select id from public.invoices");
    assert.equal(visibleRows.rows.length, 1, "RLS exposes only the selected entity's invoice");

    await assert.rejects(
      db.query("select public.agent_ar_overview($1,$2,current_date)", [T, E2]),
      /Scope mismatch/,
      "a callable definer read must not use an entity other than the transaction selection",
    );
    await assert.rejects(
      db.query("select public.stage_import($1,$2,'invoices','cross-entity.csv','[]'::jsonb)", [T, E2]),
      /Scope mismatch/,
      "a callable definer write must reject the same scope mismatch before validation or mutation",
    );

    await db.exec("reset role");
    const batches = await db.query<{ count: number }>("select count(*)::int as count from public.import_batches");
    assert.equal(batches.rows[0].count, 0, "the rejected write created no import batch");
  } finally {
    await db.close();
  }
});

test("authenticated callable tenant/entity definer RPCs delegate to scope or run guards", async () => {
  const db = await migratedDatabase();
  try {
    const routines = await db.query<{ name: string; definition: string }>(`
      select p.proname as name, pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef
        and has_function_privilege('authenticated',p.oid,'EXECUTE')
      order by p.proname`);
    const unguarded = routines.rows
      .filter(r => /\bp_tenant\s+uuid\b/i.test(r.definition) && /\bp_entity\s+uuid\b/i.test(r.definition))
      .filter(r => !/o2c_private\.(?:require_scope|require_run)\s*\(/i.test(r.definition))
      .map(r => r.name);
    assert.deepEqual(unguarded, [], "every tenant/entity-parameterized callable definer RPC must check scope or run binding");

    const scope = await db.query<{ definition: string }>("select pg_get_functiondef('o2c_private.require_scope(uuid,uuid)'::regprocedure) as definition");
    assert.match(scope.rows[0].definition, /current_setting\('o2c\.tenant_id',\s*true\)/i);
    assert.match(scope.rows[0].definition, /current_setting\('o2c\.entity_id',\s*true\)/i);
    const run = await db.query<{ definition: string }>("select pg_get_functiondef('o2c_private.require_run(uuid,uuid,uuid)'::regprocedure) as definition");
    assert.match(run.rows[0].definition, /o2c_private\.require_scope\s*\(/i, "agent run validation must also enforce selected transaction scope");
  } finally {
    await db.close();
  }
});
