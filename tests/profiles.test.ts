import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Auth profiles preserve identity and cannot grant financial access", async () => {
  const db = new PGlite();
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`);
    await db.query(`insert into auth.users values ($1,'existing@example.test','{"name":"Existing user","role":"admin"}','{"provider":"google"}')`, [first]);
    await db.exec(await readFile(new URL("../supabase/migrations/202610040001_workspaces.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261006115901_user_profiles.sql", import.meta.url), "utf8"));
    const backfill = await db.query<{ email: string; full_name: string; provider: string }>("select * from public.profiles");
    assert.equal(backfill.rows[0].email, "existing@example.test");
    assert.equal(backfill.rows[0].full_name, "Existing user");
    assert.equal(backfill.rows[0].provider, "google");
    await db.query(`insert into auth.users values ($1,null,'{"full_name":"Phone identity"}',null)`, [second]);
    assert.equal((await db.query("select * from public.profiles")).rows.length, 2);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [first]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from public.profiles")).rows.length, 1);
    assert.deepEqual((await db.query<{ workspace_access: unknown }>("select public.workspace_access()")).rows[0].workspace_access, []);
    await db.exec("update public.profiles set full_name='Edited name', avatar_url='https://example.test/avatar.png'");
    assert.equal((await db.query<{ full_name: string }>("select full_name from public.profiles")).rows[0].full_name, "Edited name");
    assert.equal((await db.query("update public.profiles set full_name='Other' where id=$1 returning id", [second])).rows.length, 0);
    for (const statement of [
      "update public.profiles set email='spoof@example.test'",
      "update public.profiles set provider='admin'",
      "update public.profiles set id='00000000-0000-4000-8000-000000000003'",
      "update public.profiles set updated_at='2000-01-01'",
      "delete from public.profiles",
      `insert into public.profiles(id) values ('${second}')`,
      "select o2c_private.sync_auth_profile()",
    ]) await assert.rejects(db.exec(statement), /permission denied/);
    await assert.rejects(db.exec("update public.profiles set role='admin'"), /does not exist/);
    await assert.rejects(db.exec("update public.profiles set full_name=repeat('x',201)"), /check constraint/);
    const timestamp = await db.query<{ updated_at: Date; created_at: Date }>("select updated_at,created_at from public.profiles");
    assert.ok(timestamp.rows[0].updated_at >= timestamp.rows[0].created_at);
    await db.exec("reset role");
    await db.query(`update auth.users set email='changed@example.test',raw_app_meta_data='{"provider":"azure"}' where id=$1`, [first]);
    const synced = (await db.query<{ email: string; provider: string; full_name: string }>("select * from public.profiles where id=$1", [first])).rows[0];
    assert.equal(synced.email, "changed@example.test");
    assert.equal(synced.provider, "azure");
    assert.equal(synced.full_name, "Edited name");
    await db.exec("set role anon");
    await assert.rejects(db.exec("select * from public.profiles"), /permission denied/);
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [second]);
    assert.equal((await db.query("select * from public.profiles where id=$1", [second])).rows.length, 0);
  } finally { await db.close(); }
});
