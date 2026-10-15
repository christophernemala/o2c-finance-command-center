import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedDatabase } from "./pg-helper";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => String(n).padStart(64, "0");
const T = id(10), E = id(20), OTHER_T = id(11), OTHER_E = id(21);

test("agent runtime controls in PostgreSQL", async t => {
  const db = await migratedDatabase();
  try {
    await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now()),($4,now()),($5,now())", [id(1), id(2), id(3), id(4), id(5)]);
    await db.query("insert into public.tenants(id,name) values($1,'Tenant A'),($2,'Tenant B')", [T, OTHER_T]);
    await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'approver'),($1,$4,'viewer'),($1,$5,'maker'),($6,$7,'admin')", [T, id(1), id(2), id(3), id(4), OTHER_T, id(5)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'A'),($3,$4,'B')", [E, T, OTHER_E, OTHER_T]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'C1','Customer One'),($4,$2,$3,'C2','Customer Two'),($5,$6,$7,'X1','Other')",
      [id(30), T, E, id(31), id(32), OTHER_T, OTHER_E]);
    await db.query(`insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values
      ($1,$2,$3,$4,'INV-1','2026-08-01','2026-08-31',1000.00),($5,$2,$3,$4,'INV-2','2026-09-15','2026-10-15',2500.50),
      ($6,$2,$3,$7,'INV-3','2026-10-01','2026-10-31',400.00),($8,$2,$3,$7,'INV-4','2026-10-02','2026-11-01',9000.00)`,
      [id(40), T, E, id(30), id(41), id(42), id(31), id(43)]);
    await db.query(`insert into public.bank_lines(id,tenant_id,entity_id,reference,booked_at,direction,amount) values
      ($1,$2,$3,'INV-1','2026-10-10','credit',1000.00),($4,$2,$3,'WIRE 778','2026-10-11','credit',400.00),($5,$2,$3,'INV-4','2026-10-12','credit',9000.00)`,
      [id(50), T, E, id(51), id(52)]);
    async function asUser(n: number) {
      await db.exec("reset role");
      await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour') on conflict(token_hash) do nothing", [hash(n), id(n)]);
      await db.query("select set_config('o2c.session_hash',$1,false)", [hash(n)]);
      await db.exec("set role authenticated");
    }
    async function asAgent(sessionHash: string) {
      await db.exec("reset role");
      await db.query("select set_config('o2c.session_hash',$1,false)", [sessionHash]);
      await db.exec("set role authenticated");
    }
    async function claim(run: string, sessionHash: string) {
      await db.exec("reset role");
      return (await db.query<{ v: Record<string, string> | null }>("select o2c_private.claim_agent_run($1,$2) as v", [run, sessionHash])).rows[0].v;
    }
    const AS_OF = "2026-10-15";

    await t.test("only non-viewers request runs; requests are idempotent", async () => {
      await asUser(3);
      await assert.rejects(db.query("select public.request_agent_run($1,$2,$3,'cash_application',$4)", [T, E, id(100), AS_OF]), /Forbidden/);
      await asUser(4);
      await db.query("select public.request_agent_run($1,$2,$3,'cash_application',$4)", [T, E, id(100), AS_OF]);
      await db.query("select public.request_agent_run($1,$2,$3,'cash_application',$4)", [T, E, id(100), AS_OF]);
      await assert.rejects(db.query("select public.request_agent_run($1,$2,$3,'reporting',$4)", [T, E, id(100), AS_OF]), /Idempotency/);
      await assert.rejects(db.query("select public.request_agent_run($1,$2,$3,'reporting',$4)", [OTHER_T, OTHER_E, id(101), AS_OF]), /Forbidden/);
    });

    const agentSession = "a".repeat(64);
    await t.test("claim mints one agent session bound to the run", async () => {
      const claimed = await claim(id(100), agentSession);
      assert.equal(claimed?.kind, "cash_application");
      assert.equal(await claim(id(100), "b".repeat(64)), null, "second claim is refused");
      const role = await db.query<{ role: string; kind: string }>("select m.role,u.kind from public.memberships m join auth.users u on u.id=m.user_id where m.user_id=$1", [claimed!.agent_user]);
      assert.deepEqual(role.rows[0], { role: "agent", kind: "agent" });
    });

    await t.test("read tools return decimal strings and tier matches", async () => {
      await asAgent(agentSession);
      const overview = (await db.query<{ v: Record<string, unknown> }>("select public.agent_ar_overview($1,$2,$3) as v", [T, E, AS_OF])).rows[0].v;
      assert.equal(overview.open_ar, "12900.50");
      assert.equal(overview.overdue_ar, "1000.00");
      const candidates = (await db.query<{ v: { bank_credits: { reference: string; tier: string; confidence: string | null }[] } }>("select public.agent_cash_candidates($1,$2,50) as v", [T, E])).rows[0].v;
      const tiers = Object.fromEntries(candidates.bank_credits.map(row => [row.reference, row.tier]));
      assert.deepEqual(tiers, { "INV-1": "exact", "WIRE 778": "review", "INV-4": "exact" });
      const invoices = (await db.query<{ v: { number: string; days_overdue: number }[] }>("select public.agent_invoices($1,$2,$3,'overdue',null,10,0) as v", [T, E, AS_OF])).rows[0].v;
      assert.deepEqual(invoices.map(row => [row.number, row.days_overdue]), [["INV-1", 45]]);
      await assert.rejects(db.query("select public.agent_ar_overview($1,$2,$3)", [OTHER_T, OTHER_E, AS_OF]), /Forbidden/);
    });

    await t.test("agent proposes but cannot approve, execute, stage, or touch other runs", async () => {
      await asAgent(agentSession);
      await db.query("select public.propose_action($1,$2,$3,'receipt','1000.00','AI agent: exact reference INV-1',null,null,$4,$5)", [T, E, id(200), id(50), id(30)]);
      const row = await db.query<{ agent_run_id: string; maker: string }>("select agent_run_id from public.approvals where id=$1", [id(200)]);
      assert.equal(row.rows[0].agent_run_id, id(100));
      await assert.rejects(db.query("select public.decide_action($1,$2,$3,1,'approved')", [T, E, id(200)]), /Forbidden/);
      await assert.rejects(db.query("select public.execute_action($1,$2,$3,1)", [T, E, id(200)]), /Forbidden/);
      await assert.rejects(db.query("select public.stage_import($1,$2,'invoices','x.csv','[]'::jsonb)", [T, E]), /Forbidden/);
      await assert.rejects(db.query("select public.agent_record_step($1,$2,$3,'message',null,'{}'::jsonb,1)", [T, E, id(999)]), /Forbidden/);
      assert.equal((await db.query<{ v: number }>("select public.agent_record_step($1,$2,$3,'message',null,'{\"text\":\"hi\"}'::jsonb,1) as v", [T, E, id(100)])).rows[0].v, 1);
      await assert.rejects(db.query("update public.agent_steps set tool='x'"), /permission denied/);
    });

    await t.test("auto-post is refused without an active, independently approved policy", async () => {
      await asAgent(agentSession);
      const result = (await db.query<{ v: { status: string; reason: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(200)])).rows[0].v;
      assert.deepEqual(result, { status: "awaiting_approval", reason: "Auto-execution disabled for this entity" });
      await asUser(4);
      await assert.rejects(db.query("select public.propose_agent_policy($1,$2,$3,true,'1500.00','2000.00')", [T, E, id(300)]), /Forbidden/);
      await asUser(1);
      await assert.rejects(db.query("select public.propose_agent_policy($1,$2,$3,true,'1500.00','1000.00')", [T, E, id(300)]), /Invalid policy/);
      await db.query("select public.propose_agent_policy($1,$2,$3,true,'1500.00','2000.00')", [T, E, id(300)]);
      await assert.rejects(db.query("select public.decide_agent_policy($1,$2,$3,'active')", [T, E, id(300)]), /Independent checker/);
      await asAgent(agentSession);
      assert.equal((await db.query<{ v: { status: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(200)])).rows[0].v.status, "awaiting_approval");
      await asUser(2);
      await db.query("select public.decide_agent_policy($1,$2,$3,'active')", [T, E, id(300)]);
    });

    await t.test("auto-post executes exact matches under the limit and journals once", async () => {
      await asAgent(agentSession);
      const posted = (await db.query<{ v: { status: string; journal_id: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(200)])).rows[0].v;
      assert.equal(posted.status, "posted");
      const replay = (await db.query<{ v: { status: string; journal_id: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(200)])).rows[0].v;
      assert.equal(replay.journal_id, posted.journal_id);
      const approval = (await db.query<{ status: string; checker_basis: string; approver: string | null }>("select status,checker_basis,approver from public.approvals where id=$1", [id(200)])).rows[0];
      assert.deepEqual(approval, { status: "posted", checker_basis: "policy", approver: null });
      const receipt = (await db.query<{ id: string }>("select id from public.receipts where bank_line_id=$1", [id(50)])).rows[0].id;
      await db.query("select public.propose_action($1,$2,$3,'allocation','1000.00','AI agent: allocate INV-1',$4,$5)", [T, E, id(201), id(40), receipt]);
      // Daily limit is 2000.00 with 1000.00 used: the allocation (another 1000.00) still fits.
      assert.equal((await db.query<{ v: { status: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(201)])).rows[0].v.status, "posted");
      const open = (await db.query<{ v: { open_ar: string } }>("select public.agent_ar_overview($1,$2,$3) as v", [T, E, AS_OF])).rows[0].v.open_ar;
      assert.equal(open, "11900.50");
    });

    await t.test("over-limit, inexact and daily-cap breaches stay pending for a human", async () => {
      await asAgent(agentSession);
      await db.query("select public.propose_action($1,$2,$3,'receipt','9000.00','AI agent: exact reference INV-4',null,null,$4,$5)", [T, E, id(202), id(52), id(31)]);
      assert.match((await db.query<{ v: { reason: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(202)])).rows[0].v.reason, /per-item/);
      await db.query("select public.propose_action($1,$2,$3,'receipt','400.00','AI agent: amount-only match INV-3',null,null,$4,$5)", [T, E, id(203), id(51), id(31)]);
      assert.match((await db.query<{ v: { reason: string } }>("select public.agent_auto_post($1,$2,$3) as v", [T, E, id(203)])).rows[0].v.reason, /Daily|exact/);
      const pending = await db.query("select id from public.approvals where status='pending'");
      assert.equal(pending.rows.length, 2);
      // A human approver can still approve agent proposals; the agent is the maker.
      await asUser(2);
      await db.query("select public.decide_action($1,$2,$3,1,'approved')", [T, E, id(203)]);
      await db.query("select public.execute_action($1,$2,$3,2)", [T, E, id(203)]);
    });

    await t.test("finishing ends the agent session and reports awaiting approval", async () => {
      await asAgent(agentSession);
      const status = (await db.query<{ v: string }>("select public.agent_finish_run($1,$2,$3,'succeeded','Matched 1 of 3 credits','claude-opus-5-5',100,50,0,'0.001400',null) as v", [T, E, id(100)])).rows[0].v;
      assert.equal(status, "awaiting_approval");
      await assert.rejects(db.query("select public.agent_ar_overview($1,$2,$3)", [T, E, AS_OF]), /Forbidden/);
      await asUser(3);
      const consoleData = (await db.query<{ v: { runs: { id: string; status: string; proposals: number; auto_posted: number; cost_usd: string }[] } }>("select public.agent_console($1,$2) as v", [T, E])).rows[0].v;
      assert.deepEqual(consoleData.runs.map(run => [run.status, run.proposals, run.auto_posted, run.cost_usd]), [["awaiting_approval", 4, 2, "0.001400"]]);
      const detail = (await db.query<{ v: { steps: { seq: number }[] } }>("select public.agent_run_detail($1,$2,$3,0) as v", [T, E, id(100)])).rows[0].v;
      assert.equal(detail.steps.length, 1);
    });

    await t.test("schedules fan out once per day", async () => {
      await asUser(4);
      await assert.rejects(db.query("select public.set_agent_schedule($1,$2,'reporting','daily')", [T, E]), /Forbidden/);
      await asUser(1);
      await db.query("select public.set_agent_schedule($1,$2,'reporting','daily')", [T, E]);
      await db.exec("reset role");
      const first = await db.query("select o2c_private.schedule_due_runs('2026-10-16')");
      const second = await db.query("select o2c_private.schedule_due_runs('2026-10-16')");
      assert.equal(first.rows.length, 1); assert.equal(second.rows.length, 1);
    });

    await t.test("report pack computes countback DSO and CEI from records", async () => {
      await asUser(3);
      const pack = (await db.query<{ v: Record<string, unknown> }>("select public.report_ar_pack($1,$2,$3) as v", [T, E, AS_OF])).rows[0].v;
      // The human-approved 400.00 receipt is unallocated, so invoice open balances are unchanged.
      assert.equal(pack.open_ar, "11900.50");
      // October sales to date 9400.00 covers 15 days; September 2500.50 of remaining 2500.50 covers all 30 days.
      assert.equal(pack.dso_countback_days, "45.00");
      assert.equal(typeof pack.cei_30d_percent, "string");
    });

    await t.test("copilot threads are private to their owner", async () => {
      await asUser(4);
      await db.query("select public.copilot_append($1,$2,$3,'user','Who owes us the most?','[]'::jsonb)", [T, E, id(400)]);
      await db.query("select public.copilot_append($1,$2,$3,'assistant','Customer Two.','[]'::jsonb)", [T, E, id(400)]);
      assert.equal((await db.query<{ v: unknown[] }>("select public.copilot_history($1,$2,$3) as v", [T, E, id(400)])).rows[0].v.length, 2);
      await asUser(1);
      assert.equal((await db.query<{ v: unknown[] }>("select public.copilot_history($1,$2,$3) as v", [T, E, id(400)])).rows[0].v.length, 0);
      await assert.rejects(db.query("select public.copilot_append($1,$2,$3,'user','hijack','[]'::jsonb)", [T, E, id(400)]), /Forbidden/);
      assert.equal((await db.query("select * from public.copilot_messages")).rows.length, 0, "RLS hides other users' messages");
    });
  } finally { await db.close(); }
});
