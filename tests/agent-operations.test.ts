import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";
import { blockFor, canonicalJson, evaluateGuardrails, inputHash, type Guardrail } from "../src/lib/ai/guardrails";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20);

test("agent operations: guardrails, enforcement, simulation, incidents and read models", async t => {
  const db = await migratedDatabase();
  try {
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now()),($4,now())", [id(1), id(2), id(3), id(4)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($1,$5,'maker')", [T, id(1), id(2), id(3), id(4)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [E, T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'C1','Customer One')", [id(30), T, E]);
    await db.query(`insert into public.bank_lines(id,tenant_id,entity_id,reference,booked_at,direction,amount) values
      ($1,$2,$3,'WIRE 1','2026-10-10','credit',9000.00),($4,$2,$3,'WIRE 2','2026-10-11','credit',400.00)`, [id(50), T, E, id(51)]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    const rpc = async <V = unknown>(sql: string, values: unknown[]) => (await db.query<{ v: V }>(sql, values)).rows[0].v;
    const G = id(200);
    const amountRule = { tool: "propose_receipt", limit: "5000.00" };

    await t.test("guardrails start in Monitor; viewers and invalid rules are refused", async () => {
      await asUser(3);
      await assert.rejects(db.query("select public.propose_guardrail($1,$2,$3,'Cap','max_amount',null,$4,null)", [T, E, G, amountRule]), /Forbidden/);
      await asUser(4);
      await assert.rejects(db.query("select public.propose_guardrail($1,$2,$3,'Cap','max_amount',null,$4,null)", [T, E, id(201), { tool: "propose_receipt", limit: "5000.001" }]), /Invalid guardrail/);
      await assert.rejects(db.query("select public.propose_guardrail($1,$2,$3,'Cap','deny_tool',null,$4,null)", [T, E, id(201), { tool: "drop_table" }]), /Invalid guardrail/);
      await db.query("select public.propose_guardrail($1,$2,$3,'Receipt cap','max_amount','cash_application',$4,$5)", [T, E, G, amountRule, { would_act_on: 0 }]);
      await db.query("select public.propose_guardrail($1,$2,$3,'Receipt cap','max_amount','cash_application',$4,$5)", [T, E, G, amountRule, { would_act_on: 0 }]);
      const active = await rpc<{ stage: string; version: number }[]>("select public.agent_guardrails_active($1,$2,'cash_application') as v", [T, E]);
      assert.deepEqual(active.map(rule => [rule.stage, rule.version]), [["monitor", 1]]);
      assert.deepEqual(await rpc("select public.agent_guardrails_active($1,$2,'reporting') as v", [T, E]), [], "scoped to its agent kind");
    });

    await t.test("every stage change needs an independent checker", async () => {
      await asUser(4);
      await assert.rejects(db.query("select public.propose_guardrail_stage($1,$2,$3,3,'block',null)", [T, E, G]), /Stale/);
      await db.query("select public.propose_guardrail_stage($1,$2,$3,2,'block',$4)", [T, E, G, { would_act_on: 1 }]);
      await assert.rejects(db.query("select public.propose_guardrail_stage($1,$2,$3,3,'warn',null)", [T, E, G]), /Stale|already pending/);
      await assert.rejects(db.query("select public.decide_guardrail_stage($1,$2,$3,2,'active')", [T, E, G]), /Forbidden/, "makers cannot decide");
      await asUser(1);
      await db.query("select public.propose_guardrail($1,$2,$3,'Admin rule','deny_tool',null,$4,null)", [T, E, id(202), { tool: "propose_collection_message" }]);
      await db.query("select public.propose_guardrail_stage($1,$2,$3,2,'warn',null)", [T, E, id(202)]);
      await assert.rejects(db.query("select public.decide_guardrail_stage($1,$2,$3,2,'active')", [T, E, id(202)]), /Independent checker/);
      await asUser(2);
      await db.query("select public.decide_guardrail_stage($1,$2,$3,2,'active')", [T, E, G]);
      const versions = (await db.query<{ version: number; stage: string; status: string }>("select version,stage,status from public.agent_guardrail_versions where guardrail_id=$1 order by version", [G])).rows;
      assert.deepEqual(versions, [{ version: 1, stage: "monitor", status: "superseded" }, { version: 2, stage: "block", status: "active" }]);
    });

    await t.test("block-stage amount rule stops an agent proposal sent by direct RPC; humans are unaffected", async () => {
      await db.exec("reset role");
      await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Cash application agent','queued','cash_application','manual','2026-10-15')", [id(100), T, E]);
      await db.query("select o2c_private.claim_agent_run($1,$2)", [id(100), "a".repeat(64)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", ["a".repeat(64)]);
      await db.exec("set role authenticated");
      await assert.rejects(db.query("select public.propose_action($1,$2,$3,'receipt','9000.00','Agent proposal over the cap',null,null,$4,$5)", [T, E, id(300), id(50), id(30)]), /Blocked by guardrail: Receipt cap/);
      await db.query("select public.propose_action($1,$2,$3,'receipt','400.00','Agent proposal under the cap',null,null,$4,$5)", [T, E, id(301), id(51), id(30)]);
      await assert.rejects(db.query("select public.propose_guardrail_stage($1,$2,$3,3,'rolled_back',null)", [T, E, G]), /Forbidden/, "agents cannot change guardrails");
      await asUser(4);
      await db.query("select public.propose_action($1,$2,$3,'receipt','9000.00','Human proposal over the cap',null,null,$4,$5)", [T, E, id(302), id(50), id(30)]);
    });

    await t.test("simulation replays recorded calls without model calls", async () => {
      await db.exec("reset role");
      await db.query(`insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of,started_at,finished_at,cost_usd,step_count) values
        ($1,$2,$3,'Cash application agent','succeeded','cash_application','manual','2026-10-15',now()-interval '60 seconds',now(),0.5,8)`, [id(110), T, E]);
      const steps: [number, string, string, unknown][] = [
        [1, "tool_call", "get_ar_overview", { input: {} }], [2, "tool_result", "get_ar_overview", { ok: true, output: "{}" }],
        [3, "tool_call", "get_ar_overview", { input: {} }], [4, "tool_result", "get_ar_overview", { ok: true, output: "{}" }],
        [5, "tool_call", "get_ar_overview", { input: {} }], [6, "tool_result", "get_ar_overview", { ok: true, output: "{}" }],
        [7, "tool_call", "propose_receipt", { input: { amount: "5000.01", bank_line_id: id(50), customer_id: id(30), evidence: "x" } }],
        [8, "tool_result", "propose_receipt", { ok: false, output: "{\"error\":\"Bank line cannot be posted\"}" }],
      ];
      for (const [seq, type, tool, detail] of steps) await db.query("insert into public.agent_steps(run_id,seq,tenant_id,entity_id,type,tool,detail,duration_ms) values($1,$2,$3,$4,$5,$6,$7,$8)", [id(110), seq, T, E, type, tool, detail, 100 * seq]);
      await asUser(3);
      const identical = await rpc<Record<string, unknown>>("select public.simulate_guardrail($1,$2,'max_identical_calls',null,$3,30) as v", [T, E, { limit: "2" }]);
      assert.deepEqual([identical.calls_replayed, identical.would_act_on, identical.failures_caught, identical.false_positives], [4, 1, 0, 1]);
      const cap = await rpc<Record<string, unknown>>("select public.simulate_guardrail($1,$2,'max_amount','cash_application',$3,30) as v", [T, E, amountRule]);
      assert.deepEqual([cap.would_act_on, cap.failures_caught, cap.false_positives, cap.total_failures, cap.cost_of_affected_runs_usd], [1, 1, 0, 1, "0.500000"]);
      const other = await rpc<Record<string, unknown>>("select public.simulate_guardrail($1,$2,'deny_tool','reporting',$3,30) as v", [T, E, { tool: "get_ar_overview" }]);
      assert.equal(other.calls_replayed, 0, "scoped to the agent kind");
    });

    await t.test("detectors open each incident once and the overview reflects them", async () => {
      await db.exec("reset role");
      await db.query(`insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of,started_at,finished_at,error,updated_at) values
        ($1,$3,$4,'Reporting agent','failed','reporting','manual','2026-10-15',now()-interval '30 seconds',now(),'boom',now()),
        ($2,$3,$4,'Collections agent','running','collections','manual','2026-10-15',now()-interval '15 minutes',null,null,now()-interval '15 minutes')`, [id(111), id(112), T, E]);
      // Run 100 is still running but active; only the stale run counts as stuck.
      await db.query("update public.agent_runs set updated_at=now() where id=$1", [id(100)]);
      const first = (await db.query<{ n: number }>("select o2c_private.detect_agent_incidents($1,$2) as n", [T, E])).rows[0].n;
      const second = (await db.query<{ n: number }>("select o2c_private.detect_agent_incidents($1,$2) as n", [T, E])).rows[0].n;
      assert.equal(first, 3); assert.equal(second, 0, "idempotent");
      const kinds = (await db.query<{ kind: string; severity: string; run_id: string }>("select kind,severity,run_id from public.agent_incidents order by kind")).rows;
      assert.deepEqual(kinds, [
        { kind: "loop", severity: "warning", run_id: id(110) },
        { kind: "run_failed", severity: "critical", run_id: id(111) },
        { kind: "stuck_run", severity: "critical", run_id: id(112) },
      ]);
      await asUser(3);
      const overview = await rpc<{ runs: Record<string, unknown>; health: { score: number; inputs: Record<string, number> }; incidents: Record<string, number>; tools: Record<string, number> }>(
        "select public.agent_ops_overview($1,$2,24) as v", [T, E]);
      assert.deepEqual(overview.incidents, { open_critical: 2, open_warning: 1 });
      assert.deepEqual(overview.tools, { results: 4, errors: 1 });
      // run success 50 (1 of 2 finished), approval age 100 (oldest pending is minutes old), incidents 100-80-15=5, tool errors 75.
      assert.deepEqual(overview.health.inputs, { run_success: 50, approval_age: 100, incidents: 5, tool_errors: 75 });
      assert.equal(overview.health.score, 56, "(30*50 + 20*100 + 20*5 + 15*75) / 85 = 55.6");
      const edges = await rpc<Record<string, unknown>[]>("select public.agent_edges($1,$2,24) as v", [T, E]);
      assert.deepEqual(edges.map(edge => [edge.agent, edge.tool, edge.calls, edge.ok, edge.failed]), [["cash_application", "get_ar_overview", 3, 3, 0], ["cash_application", "propose_receipt", 1, 0, 1]]);
      const failures = await rpc<{ input: Record<string, string> }[]>("select public.edge_failures($1,$2,'cash_application','propose_receipt',24) as v", [T, E]);
      assert.equal(failures[0].input.amount, "5000.01");
      await assert.rejects(db.query("select public.resolve_agent_incident($1,$2,(select id from public.agent_incidents where kind='loop'))", [T, E]), /Forbidden/);
      await asUser(2);
      await db.query("select public.resolve_agent_incident($1,$2,(select id from public.agent_incidents where kind='loop'))", [T, E]);
      assert.equal((await rpc<unknown[]>("select public.agent_incidents_list($1,$2,'open') as v", [T, E])).length, 2);
    });

    await t.test("an entity with no finished runs has no health score", async () => {
      await db.exec("reset role");
      await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Empty')", [id(21), T]);
      await asUser(3);
      const overview = await rpc<{ health: unknown; runs: { finished: number } }>("select public.agent_ops_overview($1,$2,24) as v", [T, id(21)]);
      assert.equal(overview.health, null); assert.equal(overview.runs.finished, 0);
    });
  } finally { await db.close(); }
});

test("guardrail evaluation order, canonical hashing and block results", () => {
  const rule = (kind: Guardrail["kind"], stage: Guardrail["stage"], params: Record<string, unknown>, name = kind): Guardrail => ({ id: name, name, kind, params, stage, version: 1 });
  const rules = [
    rule("max_identical_calls", "block", { limit: "2" }),
    rule("require_field", "warn", { tool: "propose_receipt", field: "customer_id" }),
    rule("max_amount", "block", { tool: "propose_receipt", limit: "1000.00" }),
    rule("deny_tool", "monitor", { tool: "propose_receipt" }),
  ];
  const hits = evaluateGuardrails(rules, "propose_receipt", { amount: "1000.01" }, 3);
  assert.deepEqual(hits.map(hit => [hit.rule.kind, hit.action]), [["deny_tool", "observed"], ["max_amount", "blocked"], ["require_field", "warned"], ["max_identical_calls", "blocked"]]);
  assert.deepEqual(blockFor(hits), { blocked_by: "max_amount", rule_id: "max_amount", stage: "block", reason: "Amount AED 1000.01 exceeds the AED 1000.00 limit" });
  assert.deepEqual(evaluateGuardrails(rules, "propose_receipt", { amount: "1000.00", customer_id: "c" }, 1).map(hit => hit.action), ["observed"], "at the limit is allowed");
  assert.equal(blockFor(evaluateGuardrails(rules, "propose_receipt", { amount: "not money" }, 1).filter(hit => hit.rule.kind === "max_amount")), null);
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } }), '{"a":{"c":null,"d":[2,{"x":0,"y":1}]},"b":1}');
  assert.equal(inputHash("t", { a: 1, b: 2 }), inputHash("t", { b: 2, a: 1 }));
  assert.notEqual(inputHash("t", { a: 1 }), inputHash("u", { a: 1 }));
});

test("tool loop records guardrail hits and never runs a blocked tool", async () => {
  const { runLoop } = await import("../src/lib/ai/loop");
  const { tools } = await import("../src/lib/ai/tools");
  let rpcCalls = 0;
  const context = { client: { rpc: async () => { rpcCalls++; return { data: { open_ar: "1.00" }, error: null }; } }, tenant: "t", entity: "e", asOf: "2026-10-15", actor: "agent" as const, findings: [] };
  const use = (n: number) => ({ type: "tool_use", id: `u${n}`, name: "get_ar_overview", input: {} });
  let turn = 0; let lastResults: { is_error?: boolean; content: string }[] = [];
  const call = async (params: { messages: { content: unknown }[] }) => {
    turn++;
    if (turn > 1) lastResults = params.messages.at(-1)!.content as typeof lastResults;
    const content = turn === 1 ? [use(1), use(2), use(3)] : [{ type: "text", text: "Done.", citations: null }];
    return { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: turn === 1 ? "tool_use" : "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never;
  };
  const events: string[] = [];
  const result = await runLoop({ call: call as never, model: "claude-opus-5-5", effort: "low", system: "s", tools, context, messages: [{ role: "user", content: "q" }], maxTurns: 3,
    guardrails: [{ id: "g1", name: "No repeats", kind: "max_identical_calls", params: { limit: "2" }, stage: "block", version: 2 }],
    onEvent: async event => { events.push(event.type === "guardrail" ? `guardrail:${event.hit.action}` : event.type); } });
  assert.equal(result.status, "succeeded");
  assert.equal(rpcCalls, 2, "the third identical call never reached PostgreSQL");
  assert.deepEqual(events, ["tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "guardrail:blocked", "tool_result", "message"]);
  assert.equal(lastResults[2].is_error, true);
  assert.deepEqual(JSON.parse(lastResults[2].content), { blocked_by: "No repeats", rule_id: "g1", stage: "block", reason: "Identical get_ar_overview call repeated 3 times in this run (limit 2)" });
});
