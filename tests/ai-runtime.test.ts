import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { buildWorkbookBytes } from "../src/modules/DashboardRenderer/browserExcel";
import { describeWorkbook, readXlsx, XLSX_TYPE } from "../src/lib/xlsx-read";
import { runLoop, type ModelCaller } from "../src/lib/ai/loop";
import { executeRun } from "../src/lib/ai/runner";
import { toolDefinitions, tools, toolsFor, type ToolContext } from "../src/lib/ai/tools";
import { usageCost } from "../src/lib/ai/pricing";
import { aiConfig } from "../src/lib/ai/config";
import { arPackWorkbook, validateArPack } from "../src/lib/ar-pack";
import type { SqlPool } from "../src/lib/postgres/transaction";
import { migratedDatabase } from "./pg-helper";

// Test-only scripted model responses. Production code never fabricates model output.
type Block = Anthropic.Beta.BetaContentBlock;
const reply = (content: Block[], stop: Anthropic.Beta.BetaStopReason = "tool_use") => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: stop, stop_sequence: null,
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
}) as unknown as Anthropic.Beta.BetaMessage;
const use = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;
const say = (text: string) => ({ type: "text", text, citations: null }) as unknown as Block;
const lastToolResult = (params: { messages: Anthropic.Beta.BetaMessageParam[] }) => {
  const last = params.messages.at(-1)!; const block = (last.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
  return JSON.parse(block.content as string);
};

test("xlsx reader round-trips the workbook builder and pages rows", () => {
  const bytes = buildWorkbookBytes({ Aging: [{ Customer: "Customer & Co <LLC>", "Open AED": "1250.50" }, { Customer: "Second", "Open AED": "0.10" }] });
  const sheets = readXlsx(bytes);
  assert.equal(sheets[0].name, "Aging");
  assert.deepEqual(sheets[0].rows.slice(1), [["Customer", "Open AED"], ["Customer & Co <LLC>", "1250.50"], ["Second", "0.10"]]);
  const page = describeWorkbook(new TextEncoder().encode("number,amount\nINV-1,10.00\nINV-2,20.00\n"), "text/csv", null, 1, 1);
  assert.deepEqual(page.rows, [["INV-2", "20.00"]]); assert.equal(page.total_rows, 2);
  assert.throws(() => readXlsx(new TextEncoder().encode("not a zip")));
  assert.equal(describeWorkbook(bytes, XLSX_TYPE, "Aging", 0, 10).sheet, "Aging");
});

test("tool registry: schemas, actor scoping and pricing", () => {
  const definitions = toolDefinitions(tools);
  assert.ok(definitions.every(definition => definition.input_schema.type === "object" && !("$schema" in definition.input_schema)));
  assert.deepEqual(toolsFor("copilot", false).filter(entry => entry.writes), []);
  assert.ok(toolsFor("copilot", true).some(entry => entry.name === "propose_receipt"));
  assert.ok(!toolsFor("copilot", true).some(entry => entry.name === "auto_post_if_policy_allows"));
  assert.ok(!toolsFor("agent", true).some(entry => entry.name === "read_uploaded_file"));
  assert.equal(usageCost("claude-opus-5-5", { input: 1_000_000, output: 100_000, cacheRead: 1_000_000, cacheWrite: 0 }), "6.200000");
  assert.equal(usageCost("unknown-model", { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }), null);
  assert.equal(aiConfig({}), null);
  assert.equal(aiConfig({ ANTHROPIC_API_KEY: "k", AI_AGENT_EFFORT: "bogus" })?.agentEffort, "medium");
});

test("loop validates tool input, reports refusals and caps turns", async () => {
  const context: ToolContext = { client: { rpc: async () => ({ data: { open_ar: "10.00" }, error: null }) }, tenant: "t", entity: "e", asOf: "2026-10-15", actor: "copilot", findings: [] };
  const events: string[] = [];
  let turn = 0;
  const call: ModelCaller = async params => {
    turn++;
    if (turn === 1) return reply([use("a", "list_invoices", { filter: "nope" }), use("b", "get_ar_overview", {})]);
    const results = params.messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    assert.equal(results.length, 2, "parallel results return in one user message");
    assert.equal(results[0].is_error, true); assert.match(String(results[0].content), /Invalid input/);
    assert.match(String(results[1].content), /10\.00/);
    return reply([say("Open AR is AED 10.00.")], "end_turn");
  };
  const result = await runLoop({ call, model: "claude-opus-5-5", effort: "low", system: "s", tools, context, messages: [{ role: "user", content: "q" }], maxTurns: 4, onEvent: async event => { events.push(event.type); } });
  assert.equal(result.status, "succeeded"); assert.equal(result.text, "Open AR is AED 10.00.");
  assert.deepEqual(events, ["tool_call", "tool_result", "tool_call", "tool_result", "message"]);
  const refused = await runLoop({ call: async () => reply([], "refusal"), model: "m", effort: "low", system: "s", tools, context, messages: [{ role: "user", content: "q" }], maxTurns: 2, onEvent: async () => {} });
  assert.equal(refused.status, "failed");
  const looping = await runLoop({ call: async () => reply([use("x", "get_ar_overview", {})]), model: "m", effort: "low", system: "s", tools, context, messages: [{ role: "user", content: "q" }], maxTurns: 2, onEvent: async () => {} });
  assert.match(looping.error ?? "", /Stopped after 2/);
});

test("AR pack workbook keeps decimal strings", () => {
  const pack = validateArPack({ as_of: "2026-10-15", open_ar: "100.00", overdue_ar: "0.00", disputed_ar: "0.00", unapplied_cash: "0.00", open_invoice_count: 1, customer_count: 1,
    unposted_bank_credits: 0, pending_approvals: 0, aging: [{ bucket: "Current", amount: "100.00", invoices: 1 }], top_debtors: [], dso_countback_days: null, dso_basis: "x", cei_30d_percent: "97.50",
    cei_basis: { period_start: "2026-09-16", period_end: "2026-10-15", beginning_ar: "0.00", credit_sales: "100.00", ending_ar: "100.00", ending_current_ar: "100.00" } });
  const sheets = arPackWorkbook(pack, "Entity");
  assert.equal(sheets.Summary.find(row => row.Metric === "Open AR (AED)")?.Value, "100.00");
  assert.equal(sheets.Summary.find(row => row.Metric === "DSO, countback (days)")?.Value, "Insufficient history");
  assert.throws(() => validateArPack({ ...pack, open_ar: 100 }));
});

test("end-to-end agent run: claim, tools through RLS, policy auto-post, recorded steps", async () => {
  const db = await migratedDatabase();
  try {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    await db.exec("create role o2c_runtime login nosuperuser nobypassrls; grant o2c_app to o2c_runtime;");
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())", [id(1), id(2), id(3)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant')", [id(10)]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'maker')", [id(10), id(1), id(2), id(3)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity')", [id(20), id(10)]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'C1','Customer One')", [id(30), id(10), id(20)]);
    await db.query("insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,$4,'INV-9','2026-09-01','2026-10-01',750.25)", [id(40), id(10), id(20), id(30)]);
    await db.query("insert into public.bank_lines(id,tenant_id,entity_id,reference,booked_at,direction,amount) values($1,$2,$3,'INV-9','2026-10-14','credit',750.25)", [id(50), id(10), id(20)]);
    await db.query("insert into public.agent_policies(id,tenant_id,entity_id,auto_execute,per_item_limit,daily_limit,status,maker,checker) values($1,$2,$3,true,1000,5000,'active',$4,$5)", [id(60), id(10), id(20), id(1), id(2)]);
    await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,requested_by,as_of) values($1,$2,$3,'Cash application agent','queued','cash_application','manual',$4,'2026-10-15')", [id(100), id(10), id(20), id(3)]);
    // Pool adapter: each connection runs as a non-owner runtime login, like production.
    const pool: SqlPool = { connect: async () => { await db.exec("reset role; set role o2c_runtime"); return { query: (sql: string, values?: unknown[]) => db.query(sql, values) as never, release: () => {} }; } };
    let turn = 0;
    const call: ModelCaller = async params => {
      turn++;
      assert.equal(params.model, "claude-opus-5-5"); assert.deepEqual(params.thinking, { type: "adaptive", display: "summarized" }); assert.equal(params.fallbacks, "default");
      if (turn === 1) return reply([{ type: "thinking", thinking: "Check candidates first.", signature: "sig" } as unknown as Block, use("t1", "get_cash_match_candidates", { limit: 50 })]);
      if (turn === 2) {
        const credit = lastToolResult(params).bank_credits[0];
        assert.equal(credit.tier, "exact"); assert.equal(credit.amount, "750.25");
        return reply([use("t2", "propose_receipt", { bank_line_id: credit.bank_line_id, customer_id: credit.customer_id, amount: credit.amount, evidence: "Bank reference INV-9 equals invoice number; amount equals open balance." })]);
      }
      if (turn === 3) return reply([use("t3", "auto_post_if_policy_allows", { approval_id: lastToolResult(params).approval_id })]);
      assert.equal(lastToolResult(params).status, "posted");
      return reply([say("Posted 1 exact match (AED 750.25) under policy.")], "end_turn");
    };
    const claimed = await executeRun(id(100), { pool, config: { apiKey: "test", model: "claude-opus-5-5", agentEffort: "medium", copilotEffort: "low" }, call });
    assert.equal(claimed?.kind, "cash_application");
    assert.equal(await executeRun(id(100), { pool, config: null, call: null }), null, "a run executes once");
    await db.exec("reset role");
    const run = (await db.query<{ status: string; summary: string; cost_usd: string; step_count: number; model: string }>("select status,summary,cost_usd::text,step_count,model from public.agent_runs where id=$1", [id(100)])).rows[0];
    assert.equal(run.status, "succeeded"); assert.match(run.summary, /750\.25/); assert.equal(run.model, "claude-opus-5-5");
    assert.equal(run.cost_usd, "0.032400"); // 4 turns x (1000 in @4 + 200 out @20 + 500 cache read @0.20) per MTok
    const steps = (await db.query<{ type: string }>("select type from public.agent_steps where run_id=$1 order by seq", [id(100)])).rows.map(row => row.type);
    assert.deepEqual(steps, ["thinking", "tool_call", "tool_result", "tool_call", "proposal", "tool_result", "tool_call", "auto_execution", "tool_result", "message"]);
    const approval = (await db.query<{ status: string; checker_basis: string; agent_run_id: string }>("select status,checker_basis,agent_run_id from public.approvals")).rows[0];
    assert.deepEqual(approval, { status: "posted", checker_basis: "policy", agent_run_id: id(100) });
    assert.equal((await db.query("select * from auth.sessions")).rows.length, 0, "agent session revoked at finish");
    // Unconfigured provider: recorded failure, no simulated output.
    await db.query("insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,as_of) values($1,$2,$3,'Reporting agent','queued','reporting','schedule','2026-10-15')", [id(101), id(10), id(20)]);
    await executeRun(id(101), { pool, config: null, call: null });
    await db.exec("reset role");
    const failed = (await db.query<{ status: string; error: string }>("select status,error from public.agent_runs where id=$1", [id(101)])).rows[0];
    assert.deepEqual(failed, { status: "failed", error: "AI provider not configured" });
  } finally { await db.close(); }
});
