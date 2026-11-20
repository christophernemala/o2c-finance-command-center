import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("PostgreSQL authorizes tool calls, hashes their inputs and records guardrail blocks before effects", async () => {
  const db = await migratedDatabase();
  try {
    const T = id(10), E = id(20), maker = id(1), checker = id(2), run = id(100), session = "e".repeat(64);
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())", [maker,checker]);
    await db.query("insert into public.tenants(id,name) values($1,'Guardrail tenant')", [T]);
    await db.query("insert into public.memberships(tenant_id,user_id,role) values($1,$2,'maker'),($1,$3,'approver')", [T,maker,checker]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Guardrail entity')", [E,T]);
    await db.query(`insert into public.agent_guardrails(id,tenant_id,entity_id,name,kind,agent_kind,params,created_by) values
      ($1,$3,$4,'Customer required','require_field','cash_application',$5::jsonb,$6),
      ($2,$3,$4,'No repeated identical call','max_identical_calls','cash_application',$7::jsonb,$6)`,
    [id(200),id(201),T,E,JSON.stringify({tool:"propose_receipt",field:"customer_id"}),maker,JSON.stringify({limit:"1"})]);
    await db.query(`insert into public.agent_guardrail_versions(guardrail_id,version,tenant_id,entity_id,stage,status,maker,checker,decided_at) values
      ($1,1,$3,$4,'block','active',$5,$6,now()),($2,1,$3,$4,'block','active',$5,$6,now())`, [id(200),id(201),T,E,maker,checker]);
    await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Cash application agent','queued','cash_application','manual',current_date)", [run,T,E]);
    await db.query("select o2c_private.claim_agent_run($1,$2)", [run,session]);
    await db.query("select set_config('o2c.session_hash',$1,false)", [session]);
    await db.query("select set_config('o2c.tenant_id',$1,false),set_config('o2c.entity_id',$2,false)", [T,E]);
    await db.exec("set role authenticated");

    const authorize = async (input: Record<string, unknown>) => (await db.query<{ decision: { allowed: boolean; call_seq: number; hits: { rule: { kind: string }; action: string }[]; block: { blocked_by: string } | null } }>(
      "select public.agent_authorize_tool($1,$2,$3,'propose_receipt',$4::jsonb) as decision", [T,E,run,JSON.stringify(input)])).rows[0].decision;

    const missing = await authorize({bank_line_id:id(50),amount:"10.00",evidence:"source reference"});
    assert.equal(missing.allowed,false);
    assert.equal(missing.block?.blocked_by,"Customer required");
    assert.deepEqual(missing.hits.map(hit => [hit.rule.kind,hit.action]), [["require_field","blocked"]]);

    const blank = await authorize({bank_line_id:id(50),customer_id:"  ",amount:"10.00",evidence:"source reference"});
    assert.equal(blank.allowed,false);
    assert.equal(blank.block?.blocked_by,"Customer required","whitespace-only strings count as missing fields");

    const validInput = {bank_line_id:id(50),customer_id:id(30),amount:"10.00",evidence:"source reference"};
    const allowed = await authorize(validInput);
    assert.equal(allowed.allowed,true);
    assert.equal(allowed.block,null);
    assert.deepEqual(allowed.hits,[]);

    const repeated = await authorize(validInput);
    assert.equal(repeated.allowed,false);
    assert.equal(repeated.block?.blocked_by,"No repeated identical call");
    assert.deepEqual(repeated.hits.map(hit => [hit.rule.kind,hit.action]), [["max_identical_calls","blocked"]]);

    const stored = await db.query<{ tool: string; input_hash: string; input: Record<string, unknown> }>(
      "select tool,detail->>'input_hash' as input_hash,detail->'input' as input from public.agent_steps where run_id=$1 and type='tool_call' order by seq", [run]);
    assert.equal(stored.rows.length,4);
    assert.equal(stored.rows[0].input_hash, (await db.query<{ expected: string }>(
      "select encode(pg_catalog.sha256(pg_catalog.convert_to('propose_receipt'||pg_catalog.chr(10)||$1::jsonb::text,'UTF8')),'hex') as expected", [JSON.stringify({bank_line_id:id(50),amount:"10.00",evidence:"source reference"})])).rows[0].expected,
    "the immutable call hash is computed from the stored JSONB inside PostgreSQL");
    assert.deepEqual(stored.rows[2].input,validInput);
    assert.equal((await db.query<{ step_count: number }>("select step_count from public.agent_runs where id=$1", [run])).rows[0].step_count,7);
    await assert.rejects(db.query("select public.agent_record_step($1,$2,$3,'tool_call','propose_receipt','{}'::jsonb,1)",[T,E,run]), /require agent_authorize_tool/);
  } finally {
    await db.close();
  }
});
