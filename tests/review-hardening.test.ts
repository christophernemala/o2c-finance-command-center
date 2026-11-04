import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = id(10), E = id(20), E2 = id(21), C = id(30), C2 = id(31);

test("agent sessions are entity-bound, disabled agents cannot claim, stale runs expire, promises ignore later invoices", async () => {
  const db = await migratedDatabase();
  try {
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [id(4)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'maker')", [T, id(4)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$3,'A'),($2,$3,'B')", [E, E2, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$3,$4,'C1','One'),($2,$3,$5,'C2','Two')", [C, C2, T, E, E2]);
    await db.query("insert into public.bank_lines(id,tenant_id,entity_id,reference,booked_at,direction,amount) values($1,$2,$3,'REF','2026-10-10','credit',100.00)", [id(50), T, E2]);
    const run = async (n: number, extra = "") => { await db.exec("reset role"); await db.query(`insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of${extra ? ",created_at" : ""}) values($1,$2,$3,'Agent','queued','credit_risk','manual',current_date${extra ? "," + extra : ""})`, [id(n), T, E]); };
    const claim = async (n: number, hash: string) => { await db.exec("reset role"); return (await db.query<{ v: unknown }>("select o2c_private.claim_agent_run($1,$2) as v", [id(n), hash])).rows[0].v; };

    await run(100);
    assert.ok(await claim(100, "a".repeat(64)));
    await db.query("select set_config('o2c.session_hash',$1,false)", ["a".repeat(64)]);
    await db.exec("set role authenticated");
    await db.query("select public.place_customer_hold($1,$2,$3,$4,'In the run entity')", [T, E, id(80), C]);
    await assert.rejects(db.query("select public.place_customer_hold($1,$2,$3,$4,'Other entity')", [T, E2, id(81), C2]), /Forbidden/, "require_scope binds the agent to its run's entity");
    await assert.rejects(db.query("select public.propose_action($1,$2,$3,'receipt','100.00','evidence',null,null,$4,$5)", [T, E2, id(82), id(50), C2]), /Forbidden/, "propose_action binds the agent too");

    await db.exec("reset role");
    await db.query("update auth.users set disabled=true where kind='agent'");
    await run(101);
    assert.equal(await claim(101, "b".repeat(64)), null, "a disabled agent identity is never revived");
    assert.deepEqual((await db.query("select status,error from public.agent_runs where id=$1", [id(101)])).rows[0], { status: "failed", error: "The agent identity for this workspace is disabled" });

    await run(102, "now()-interval '2 hours'");
    await run(103);
    await db.exec("reset role");
    await db.query("select o2c_private.schedule_due_runs(current_date)");
    assert.equal((await db.query<{ status: string }>("select status from public.agent_runs where id=$1", [id(102)])).rows[0].status, "failed", "an old queued manual run expires");
    assert.equal((await db.query<{ status: string }>("select status from public.agent_runs where id=$1", [id(103)])).rows[0].status, "queued");
    assert.equal((await db.query<{ v: number }>("select o2c_private.skip_agent_runs($1::uuid[]) as v", [[id(103)]])).rows[0].v, 1);
    assert.match((await db.query<{ error: string }>("select error from public.agent_runs where id=$1", [id(103)])).rows[0].error, /ran out of time/);

    // Account promise recorded two days ago; an invoice issued afterwards, due before the promise date, is outside it.
    await db.query("insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,$4,'LATE',current_date,current_date-1,50.00)", [id(40), T, E, C]);
    const state = (await db.query<{ v: string }>("select o2c_private.promise_state($1,$2,$3,null,'open',current_date-1,current_date,now()-interval '2 days') as v", [T, E, C])).rows[0].v;
    assert.equal(state, "kept", "a later invoice cannot make an account promise broken");
  } finally { await db.close(); }
});

test("a policy auto-post refuses an inexact match while the daily cap still has headroom", async () => {
  const db = await migratedDatabase();
  try {
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())", [id(1), id(2)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver')", [T, id(1), id(2)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'A')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'C1','One')", [C, T, E]);
    await db.query("insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,$4,'INV-9',current_date-10,current_date+20,100.00)", [id(40), T, E, C]);
    await db.query("insert into public.bank_lines(id,tenant_id,entity_id,reference,booked_at,direction,amount) values($1,$2,$3,'WIRE 1',current_date,'credit',100.00)", [id(50), T, E]);
    await db.query("insert into public.agent_policies(id,tenant_id,entity_id,auto_execute,per_item_limit,daily_limit,status,maker,checker) values($1,$2,$3,true,1000,1000,'active',$4,$5)", [id(60), T, E, id(1), id(2)]);
    await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Agent','queued','cash_application','manual',current_date)", [id(100), T, E]);
    await db.query("select o2c_private.claim_agent_run($1,$2)", [id(100), "c".repeat(64)]);
    await db.query("select set_config('o2c.session_hash',$1,false)", ["c".repeat(64)]);
    await db.exec("set role authenticated");
    await db.query("select public.propose_action($1,$2,$3,'receipt','100.00','AI agent: amount-only match',null,null,$4,$5)", [T, E, id(200), id(50), C]);
    const result = (await db.query<{ v: { status: string; reason: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(200)])).rows[0].v;
    assert.deepEqual([result.status, result.reason], ["awaiting_approval", "Not an exact reference and amount match"]);
  } finally { await db.close(); }
});

test("guardrails need a tool and replays must match the whole payload", async () => {
  const db = await migratedDatabase();
  try {
    for (const [kind, params] of [["deny_tool", {}], ["max_amount", { limit: "10.00" }], ["require_field", { field: "amount" }]] as const)
      await assert.rejects(db.query("select o2c_private.check_guardrail($1,$2)", [kind, params]), /Invalid guardrail/, `${kind} without a tool`);
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())", [id(4)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'maker')", [T, id(4)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'A')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'C1','One')", [C, T, E]);
    await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour')", ["d".repeat(64), id(4)]);
    await db.query("select set_config('o2c.session_hash',$1,false)", ["d".repeat(64)]);
    await db.exec("set role authenticated");
    const remark = (channel: string) => db.query("select public.add_customer_remark($1,$2,$3,$4,null,'no_answer',$5,'Called, no answer',null,null,null)", [T, E, id(90), C, channel]);
    await remark("call"); await remark("call");
    await assert.rejects(remark("email"), /Idempotency key conflict/, "a different channel under the same id is not a replay");
    const contact = (primary: boolean) => db.query("select public.add_customer_contact($1,$2,$3,$4,'Reem','ar@example.com','ar',$5)", [T, E, id(60), C, primary]);
    await contact(true); await contact(true);
    await assert.rejects(contact(false), /Idempotency key conflict/, "a changed primary flag is not a replay");
  } finally { await db.close(); }
});
