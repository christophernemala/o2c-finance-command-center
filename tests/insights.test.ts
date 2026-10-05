import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Snapshot } from "../src/types/workspace";
import { forecastWeeks } from "../src/lib/cashflow";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("insights are full-entity, scoped, exact and based only on independently reviewed forecasts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of ["202610040001_workspaces.sql", "202610050001_insights.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    await db.query("insert into auth.users values($1),($2),($3)", [id(1), id(2), id(3)]);
    await db.query("insert into public.tenants(id,name) values($1,'A'),($2,'B')", [id(10), id(11)]);
    await db.query("insert into public.memberships values($1,$2,'maker'),($1,$3,'approver'),($4,$5,'admin')", [id(10), id(1), id(2), id(11), id(3)]);
    await db.query("insert into public.entities(id,tenant_id,name) values($1,$2,'A'),($3,$4,'B')", [id(20), id(10), id(21), id(11)]);
    await db.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'A','A'),($4,$5,$6,'B','B')", [id(30), id(10), id(20), id(31), id(11), id(21)]);
    await db.query(`insert into public.invoices(tenant_id,entity_id,customer_id,number,issued_at,due_date,gross)
      select $1,$2,$3,'A-'||n,'2026-09-01','2026-09-01',0.10 from generate_series(1,51) n`, [id(10), id(20), id(30)]);
    await db.query("insert into public.invoices(tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,'B','2026-09-01','2026-09-01',99999.99)", [id(11), id(21), id(31)]);
    const entries = [{ id: "one", date: "2026-10-05", direction: "in", category: "operating", amount: "0.20", source_reference: "Test source only" }];
    const publish = (checker: string, payload = entries, digest = "a") => db.query(`insert into public.cashflow_runs(tenant_id,entity_id,starts_on,opening_cash,scenario,model_version,source_digest,maker,checker,approved_at,evidence,entries)
      values($1,$2,'2026-10-05',0.10,'test scenario','test-v1',$3,$4,$5,'2026-10-04','Reviewed source only',$6::jsonb)`, [id(10), id(20), `sha256:${digest.repeat(64)}`, id(1), checker, JSON.stringify(payload)]);
    await assert.rejects(publish(id(1)), /maker.checker|required|check constraint/);
    await assert.rejects(publish(id(3)), /authorized/);
    await assert.rejects(publish(id(2), [{ ...entries[0], amount: "1.001" }]), /Invalid preserved/);
    await assert.rejects(publish(id(2), [entries[0], entries[0]]), /Invalid preserved/);
    await assert.rejects(publish(id(2), [{ ...entries[0], date: "2027-01-04" }]), /horizon/);
    await publish(id(2));
    await assert.rejects(db.exec("update public.cashflow_runs set opening_cash=100"), /append-only/);
    await assert.rejects(db.exec("delete from public.cashflow_runs"), /append-only/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]); await db.exec("set role authenticated");
    await assert.rejects(db.exec("insert into public.cashflow_runs default values"), /permission denied/);
    await assert.rejects(db.query("select public.workspace_insights($1,$2,'2026-10-05')", [id(11), id(21)]), /Forbidden/);
    const snap = async (asOf: string, page: number) => (await db.query<{ workspace_snapshot: Snapshot }>("select public.workspace_snapshot($1,$2,$3::date,$4)", [id(10), id(20), asOf, page])).rows[0].workspace_snapshot;
    const first = await snap("2026-10-05", 0); const second = await snap("2026-10-05", 1);
    assert.equal(first.invoices.length, 50); assert.equal(second.invoices.length, 1);
    assert.deepEqual(first.insights, second.insights);
    assert.equal(first.insights.charts.length, 6);
    assert.equal(first.insights.charts[0].series[2].value, "5.10");
    assert.equal(first.insights.charts[1].series[0].value, "51");
    assert.equal(first.totals.open, "5.10"); assert.ok(first.insights.forecast);
    assert.equal(forecastWeeks(first.insights.forecast!)[12].closing, "0.30");
    assert.equal((await snap("2026-10-04", 0)).insights.forecast, null);
    assert.equal((await snap("2027-01-04", 0)).insights.forecast, null);
  } finally { await db.close(); }
});
