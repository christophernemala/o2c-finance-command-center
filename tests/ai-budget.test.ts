import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { migratedDatabase } from "./pg-helper";
import { financeClient } from "../src/lib/postgres/client";
import type { SqlPool } from "../src/lib/postgres/transaction";
import { newToken, tokenHash } from "../src/lib/auth/crypto";
import { aiSpendController } from "../src/lib/ai/budget";
import type { AiSpendStatus } from "../src/types/agents";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenant = id(10), entityA = id(20), entityB = id(21);

async function fixture() {
  const db = await migratedDatabase();
  await db.exec("create role o2c_runtime login nosuperuser nobypassrls; grant o2c_app to o2c_runtime;");
  await db.query("insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,now())", [id(1), id(2), id(3)]);
  await db.query("insert into public.tenants(id,name) values($1,'Isolated test tenant')", [tenant]);
  await db.query("insert into public.memberships values($1,$2,'admin'),($1,$3,'maker'),($1,$4,'viewer')", [tenant, id(1), id(2), id(3)]);
  await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'Entity A'),($3,$2,'Entity B')", [entityA, tenant, entityB]);
  const tokens = new Map<string, string>();
  for (const user of [1, 2, 3]) {
    const token = newToken(); tokens.set(String(user), token);
    await db.query("insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values($1,$2,'login','aal1',now()+interval '1 hour')", [tokenHash(token), id(user)]);
  }
  const pool: SqlPool = { connect: async () => {
    await db.exec("reset role; set role o2c_runtime");
    return { query: (sql: string, values?: unknown[]) => db.query(sql, values) as never, release: () => {} };
  } };
  const client = (user: number) => financeClient(pool, () => tokens.get(String(user)));
  return { db, client, close: async () => { await db.exec("reset role"); await db.close(); } };
}

const scope = (entity = entityA) => ({ p_tenant: tenant, p_entity: entity });
const status = (value: unknown) => value as AiSpendStatus;

 test("daily AI cap reserves worst-case spend atomically across entities and fails closed", async () => {
  const f = await fixture();
  try {
    const admin = f.client(1);
    const saved = await admin.rpc("set_ai_spend_cap", { ...scope(), p_daily_cap: "0.100000" });
    assert.equal(saved.error, null);
    assert.equal(status(saved.data).daily_limit_usd, "0.100000");

    const first = aiSpendController(admin, tenant, entityA, id(100));
    const second = aiSpendController(admin, tenant, entityB, id(101));
    const call = { model: "claude-opus-5-5", inputBytes: 1000, maxOutputTokens: 4096 };
    await first.reserve({ ...call, call: 1 });
    await first.reserve({ ...call, call: 1 }); // Same request/call key is an idempotent replay.
    let current = await admin.rpc("ai_spend_status", scope());
    assert.equal(current.error, null);
    assert.equal(status(current.data).reserved_usd, "0.098112");
    assert.equal(status(current.data).remaining_usd, "0.001888");

    await assert.rejects(second.reserve({ ...call, call: 1 }), /spend cap would be exceeded/);
    await first.settle({ call: 1, model: call.model, usage: { input: 1000, output: 200, cacheRead: 500, cacheWrite: 0 } });
    current = await admin.rpc("ai_spend_status", scope(entityB));
    assert.equal(status(current.data).spent_usd, "0.008100");
    assert.equal(status(current.data).reserved_usd, "0.000000");
    await assert.rejects(second.reserve({ ...call, call: 1 }), /spend cap would be exceeded/);

    assert.equal((await admin.rpc("set_ai_spend_cap", { ...scope(), p_daily_cap: "0.200000" })).error, null);
    await second.reserve({ ...call, call: 1 }); // The cap is tenant-wide, including Entity B.
    current = await admin.rpc("ai_spend_status", scope());
    assert.equal(status(current.data).reserved_usd, "0.098112");
    assert.equal(status(current.data).remaining_usd, "0.093788");
    await second.release(1); // Provider call was never sent; unused headroom is released.
    current = await admin.rpc("ai_spend_status", scope());
    assert.equal(status(current.data).reserved_usd, "0.000000");
    assert.equal(status(current.data).remaining_usd, "0.191900");

    assert.equal((await admin.rpc("set_ai_spend_cap", { ...scope(), p_daily_cap: "0" })).error, null);
    const paused = await admin.rpc("ai_spend_status", scope());
    assert.equal(status(paused.data).configured, false); assert.equal(status(paused.data).paused, true);
    await assert.rejects(aiSpendController(admin, tenant, entityA, id(102)).reserve({ ...call, call: 1 }), /paused/);
    const viewer = await f.client(3).rpc("set_ai_spend_cap", { ...scope(), p_daily_cap: "50" });
    assert.match(viewer.error?.message ?? "", /Forbidden/);
  } finally { await f.close(); }
});

test("Copilot start/finish retries persist one turn and cannot replay provider work", async () => {
  const f = await fixture();
  try {
    const maker = f.client(2); const thread = id(200); const request = id(201);
    const content = "Summarize overdue AR";
    const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
    const startArgs = { ...scope(), p_thread: thread, p_request: request, p_fingerprint: fingerprint(content), p_content: content, p_payload: { files: [], allowProposals: false } };
    const started = await maker.rpc("copilot_start_turn", startArgs);
    assert.equal(started.error, null); assert.equal((started.data as { status: string }).status, "started");
    const pending = await maker.rpc("copilot_pending_turn", { ...scope(), p_thread: thread });
    assert.deepEqual(pending.data, { requestId: request, message: content, files: [], allowProposals: false });
    const replay = await maker.rpc("copilot_start_turn", startArgs);
    assert.equal((replay.data as { status: string }).status, "running");
    const conflicting = await maker.rpc("copilot_start_turn", { ...startArgs, p_fingerprint: fingerprint("different content"), p_content: "different content" });
    assert.match(conflicting.error?.message ?? "", /idempotency key conflict/i);
    const busy = await maker.rpc("copilot_start_turn", { ...startArgs, p_request: id(202), p_fingerprint: fingerprint("Another question"), p_content: "Another question" });
    assert.equal((busy.data as { status: string }).status, "busy");

    const finishArgs = { ...scope(), p_thread: thread, p_request: request, p_status: "completed", p_content: "Three accounts are overdue.", p_trace: [] };
    const finished = await maker.rpc("copilot_finish_turn", finishArgs);
    assert.equal(finished.error, null); assert.equal((finished.data as { status: string }).status, "completed");
    const finishReplay = await maker.rpc("copilot_finish_turn", finishArgs);
    assert.equal(finishReplay.error, null); assert.equal((finishReplay.data as { response: string }).response, "Three accounts are overdue.");
    const completedReplay = await maker.rpc("copilot_start_turn", startArgs);
    assert.equal((completedReplay.data as { status: string }).status, "completed");
    assert.equal((completedReplay.data as { response: string }).response, "Three accounts are overdue.");
    assert.equal((await maker.rpc("copilot_pending_turn", { ...scope(), p_thread: thread })).data, null);

    const second = await maker.rpc("copilot_start_turn", { ...startArgs, p_request: id(203), p_fingerprint: fingerprint("Next question"), p_content: "Next question" });
    assert.equal((second.data as { status: string }).status, "started");
    await f.db.exec("reset role");
    const counts = await f.db.query<{ role: string; count: number }>("select role,count(*)::int as count from public.copilot_messages where thread_id=$1 group by role", [thread]);
    assert.deepEqual(Object.fromEntries(counts.rows.map(row => [row.role, row.count])), { assistant: 1, user: 2 });
  } finally { await f.close(); }
});
