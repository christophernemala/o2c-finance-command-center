import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

interface Audit {
  removal_authorized: boolean; rls_disabled: string[]; rls_without_policies: string[];
  tables: { table_name: string; rls_enabled: boolean; policy_count: number }[];
  indexes: { index_name: string; primary_index: boolean; constraint_backed: boolean; supports_foreign_key: boolean }[];
  grants: { table_name: string; grantee: string; privilege_type: string }[];
  definer_functions: { name: string; public_execute: boolean; role_execute: Record<string, boolean> }[];
}
test("infrastructure audit runs read-only and identifies access/index invariants", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const migration of ["202610040001_workspaces.sql", "202610050001_insights.sql"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    const sql = await readFile(new URL("../.agents/skills/supabase-principal-architect-infrastructure-optimization/scripts/audit.sql", import.meta.url), "utf8");
    await db.exec("begin read only");
    const baseline = (await db.query<{ audit: Audit }>(sql)).rows[0].audit;
    assert.equal(baseline.removal_authorized, false);
    assert.equal(baseline.tables.length, 15);
    assert.deepEqual(baseline.rls_disabled, []);
    assert.deepEqual(baseline.rls_without_policies, []);
    assert.ok(baseline.tables.every(table => table.rls_enabled && table.policy_count > 0));
    assert.ok(baseline.indexes.some(index => index.index_name === "memberships_pkey" && index.primary_index && index.constraint_backed));
    assert.ok(baseline.indexes.some(index => index.index_name === "memberships_pkey" && index.supports_foreign_key));
    // An invoice-only lookup index does not cover the composite tenant/entity FK.
    assert.ok(baseline.indexes.some(index => index.index_name === "allocations_invoice" && !index.supports_foreign_key));
    assert.ok(baseline.definer_functions.some(fn => fn.name === "propose_action" && !fn.public_execute && fn.role_execute.authenticated && !fn.role_execute.anon));
    await assert.rejects(db.exec("create table public.forbidden_probe(id integer)"), /read-only/);
    await db.exec("rollback");
    await db.exec(`create table public.unprotected_probe(id integer primary key);
      create table public.deny_all_probe(id integer primary key);
      alter table public.deny_all_probe enable row level security;
      grant select on public.unprotected_probe to public;
      grant update on public.unprotected_probe to authenticated;
      create role audit_reader;
      grant pg_monitor to audit_reader;
      create role rpc_executor;
      grant rpc_executor to authenticated;
      create function public.inherited_rpc_probe() returns integer language sql security definer as $$ select 1 $$;
      revoke all on function public.inherited_rpc_probe() from public;
      grant execute on function public.inherited_rpc_probe() to rpc_executor;
      create function public.public_rpc_probe() returns integer language sql security definer as $$ select 1 $$;
      alter default privileges in schema public grant insert on tables to authenticated;
      create table public.default_grant_probe(id integer);`);
    await db.exec("begin read only");
    const probes = (await db.query<{ audit: Audit }>(sql)).rows[0].audit;
    assert.deepEqual(probes.rls_disabled, ["default_grant_probe", "unprotected_probe"]);
    assert.deepEqual(probes.rls_without_policies, ["deny_all_probe"]);
    assert.equal(probes.removal_authorized, false);
    await db.exec("rollback");
    await db.exec("set role audit_reader; begin read only");
    const reader = (await db.query<{ audit: Audit }>(sql)).rows[0].audit;
    assert.deepEqual(reader.grants, probes.grants);
    assert.ok(reader.grants.some(grant => grant.table_name === "unprotected_probe" && grant.grantee === "PUBLIC" && grant.privilege_type === "SELECT"));
    assert.ok(reader.grants.some(grant => grant.table_name === "unprotected_probe" && grant.grantee === "authenticated" && grant.privilege_type === "UPDATE"));
    assert.ok(reader.grants.some(grant => grant.table_name === "default_grant_probe" && grant.grantee === "authenticated" && grant.privilege_type === "INSERT"));
    assert.ok(reader.grants.some(grant => grant.table_name === "deny_all_probe" && grant.privilege_type === "SELECT")); // NULL relacl owner defaults.
    const inherited = reader.definer_functions.find(fn => fn.name === "inherited_rpc_probe")!;
    assert.equal(inherited.public_execute, false); assert.equal(inherited.role_execute.authenticated, true); assert.equal(inherited.role_execute.anon, false);
    const publicRpc = reader.definer_functions.find(fn => fn.name === "public_rpc_probe")!;
    assert.equal(publicRpc.public_execute, true); assert.equal(publicRpc.role_execute.anon, true);
    await db.exec("rollback; reset role");
  } finally { await db.close(); }
});
