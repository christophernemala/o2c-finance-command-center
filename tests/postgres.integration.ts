/** Explicit local-only integration suite; never runs against a hosted/user database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { authService, type SessionCookies } from "../src/lib/auth/service";
import { financeClient } from "../src/lib/postgres/client";
import { transaction, type SqlPool } from "../src/lib/postgres/transaction";
import { hashPassword, newToken, tokenHash, totp } from "../src/lib/auth/crypto";
const adminUrl = new URL(process.env.POSTGRES_TEST_ADMIN_URL ?? "");
if (!['127.0.0.1','localhost'].includes(adminUrl.hostname) || !adminUrl.pathname.startsWith('/o2c_migration_test')) throw new Error("Use a dedicated local o2c_migration_test database");
const runtimeUrl = new URL(adminUrl); runtimeUrl.username = "o2c_test_runtime";
const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
const raw = new Pool({ connectionString: runtimeUrl.toString(), max: 2 });
const pool = raw as unknown as SqlPool;
const key = Buffer.alloc(32, 17);
function jar() {
  let token: string | undefined;
  const cookies: SessionCookies = { read: () => token, write: value => { token = value; }, clear: () => { token = undefined; } };
  return { cookies, auth: authService(pool, cookies, key), finance: financeClient(pool, cookies.read) };
}
test("standalone PostgreSQL sessions, identity isolation and MFA", async t => {
  try {
    await admin.query("do $$ begin if not exists(select 1 from pg_roles where rolname='o2c_test_runtime') then create role o2c_test_runtime login nosuperuser nobypassrls; end if; end $$; grant o2c_app to o2c_test_runtime");
    if (adminUrl.password) {
      const sql = (await admin.query("select format('alter role o2c_test_runtime password %L',$1::text) as sql", [decodeURIComponent(adminUrl.password)])).rows[0].sql;
      await admin.query(sql);
    }
    const user = randomUUID(); const other = randomUUID(); const tenant = randomUUID(); const otherTenant = randomUUID(); const entity = randomUUID(); const customer = randomUUID(); const invoice = randomUUID();
    const firstEmail = `first-${user}@example.test`; const secondEmail = `second-${other}@example.test`;
    const password = "test-only-finance-password";
    await admin.query("insert into auth.users(id,email,password_hash,email_confirmed_at) values($1,$4,$3,now()),($2,$5,$3,now())", [user, other, await hashPassword(password), firstEmail, secondEmail]);
    await admin.query("insert into public.tenants(id,name) values($1,'test-only first'),($2,'test-only second')", [tenant, otherTenant]);
    await admin.query("insert into public.memberships values($1,$2,'admin'),($3,$4,'admin')", [tenant, user, otherTenant, other]);
    await admin.query("insert into public.entities(id,tenant_id,name) values($1,$2,'test-only entity')", [entity, tenant]);
    await admin.query("insert into public.customers(id,tenant_id,entity_id,account,name) values($1,$2,$3,'test-only','test-only customer')", [customer, tenant, entity]);
    await admin.query("insert into public.invoices(id,tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values($1,$2,$3,$4,'TEST-ONLY','2026-10-01','2026-10-31','9999999999999.99')", [invoice, tenant, entity, customer]);
    const first = jar(); const second = jar();
    await t.test("hashed credentials create opaque sessions; pooled tenants never mix", async () => {
      assert.equal((await first.auth.signInWithPassword({ email: firstEmail, password })).error, null);
      assert.equal((await second.auth.signInWithPassword({ email: secondEmail, password })).error, null);
      assert.equal((await first.auth.getUser()).data.user?.id, user);
      const stored = (await admin.query("select token_hash from auth.sessions where user_id=$1", [user])).rows[0].token_hash;
      assert.equal(stored, tokenHash(first.cookies.read()!)); assert.notEqual(stored, first.cookies.read());
      for (let n = 0; n < 6; n++) {
        const [a,b] = await Promise.all([first.finance.rpc("workspace_access"), second.finance.rpc("workspace_access")]);
        assert.deepEqual((a.data as { tenant_id: string }[]).map(row => row.tenant_id), [tenant]);
        assert.deepEqual((b.data as { tenant_id: string }[]).map(row => row.tenant_id), [otherTenant]);
      }
      const snapshot = await first.finance.rpc("workspace_snapshot", { p_tenant: tenant, p_entity: entity, p_as_of: "2026-10-13", p_page: 0 });
      assert.equal((snapshot.data as { totals: { open: string } }).totals.open, "9999999999999.99");
      assert.ok((await second.finance.rpc("workspace_snapshot", { p_tenant: tenant, p_entity: entity, p_as_of: "2026-10-13", p_page: 0 })).error);
      await assert.rejects(transaction(pool, async connection => connection.query("update public.invoices set gross=0"), tokenHash(first.cookies.read()!)), /permission denied/);
    });
    await t.test("actual PostgreSQL roles reject owner/bypass connections and forged claims", async () => {
      await assert.rejects(transaction(admin as unknown as SqlPool, async () => true), /non-owner/);
      await admin.query("create table public.o2c_owner_guard_probe(id integer); alter table public.o2c_owner_guard_probe owner to o2c_test_runtime");
      try { await assert.rejects(transaction(pool, async () => true), /non-owner/); }
      finally { await admin.query("drop table public.o2c_owner_guard_probe"); }
      const rows = await transaction(pool, async connection => {
        await connection.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        return connection.query("select auth.uid() as id");
      }, tokenHash(newToken()));
      assert.equal(rows.rows[0].id, null);
    });
    await t.test("original CSV bytes and staged rows commit atomically with RLS", async () => {
      const bytes = Buffer.from('number,account,customer,issued_at,due_date,amount,currency\nTEST-ONLY-IMPORT,test-only,test-only customer,2026-10-01,2026-10-31,0.10,AED');
      const digest = tokenHash(bytes.toString());
      const rows = [{ number: 'TEST-ONLY-IMPORT', account: 'test-only', customer: 'test-only customer', issued_at: '2026-10-01', due_date: '2026-10-31', amount: '0.10', currency: 'AED' }];
      const input = { tenant, entity, userId: user, digest, name: 'test-only.csv', bytes, kind: 'invoices', rows };
      const id = await first.finance.stageSource(input); assert.equal(await first.finance.stageSource(input), id);
      const source = (await admin.query("select content from public.source_files where digest=$1", [digest])).rows[0].content;
      assert.deepEqual(source, bytes);
      await assert.rejects(second.finance.stageSource({ ...input, userId: other }), /row-level security/);
      const invalid = Buffer.from('test-only-invalid-original'); const invalidDigest = tokenHash(invalid.toString());
      await assert.rejects(first.finance.stageSource({ ...input, bytes: invalid, digest: invalidDigest, rows: [{ ...rows[0], amount: 'invalid' }] }));
      assert.equal((await admin.query("select digest from public.source_files where digest=$1", [invalidDigest])).rowCount, 0);
      const unscoped = await transaction(pool, connection => connection.query("select digest from public.source_files"), tokenHash(first.cookies.read()!));
      assert.equal(unscoped.rows.length, 0, "a pooled connection must not retain the previous selected source entity");
    });
    let secret = ""; let factor = "";
    await t.test("MFA enrollment encrypts secrets, rotates sessions and revokes earlier logins", async () => {
      const before = first.cookies.read(); const enrollment = await first.auth.mfa.enroll();
      assert.equal(enrollment.error, null); assert.ok(enrollment.data); secret = enrollment.data.secret; factor = enrollment.data.id;
      const stored = (await admin.query("select secret_ciphertext from auth.mfa_factors where user_id=$1", [user])).rows[0].secret_ciphertext;
      assert.ok(!stored.includes(secret)); assert.equal((await first.auth.mfa.pendingFactor()).data?.secret, secret);
      const code = totp(secret, firstEmail).generate();
      assert.equal((await first.auth.mfa.challengeAndVerify({ factorId: factor, code, enrollment: true })).error, null);
      assert.notEqual(first.cookies.read(), before);
      const old = financeClient(pool, () => before); assert.deepEqual((await old.rpc("workspace_access")).data, []);
      assert.equal((await first.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel, 'aal2');
      assert.ok((await first.auth.mfa.challengeAndVerify({ factorId: factor, code })).error);
    });
    await t.test("an enrolled account cannot read finance data before its second factor", async () => {
      const pending = jar(); assert.equal((await pending.auth.signInWithPassword({ email: firstEmail, password })).error, null);
      assert.equal((await pending.auth.mfa.getAuthenticatorAssuranceLevel()).data?.nextLevel, 'aal2');
      assert.deepEqual((await pending.finance.rpc('workspace_access')).data, []);
      assert.ok((await pending.finance.rpc('workspace_snapshot', { p_tenant: tenant, p_entity: entity, p_as_of: '2026-10-13', p_page: 0 })).error);
      const connection = await raw.connect();
      try { assert.equal((await connection.query("select current_user as role, current_setting('o2c.session_hash',true) as identity")).rows[0].role, 'o2c_test_runtime'); }
      finally { connection.release(); }
    });
    await t.test("invitations are single-use, cannot grant financial access and reset sessions", async () => {
      const invitation = newToken(); await admin.query("update auth.users set invited_at=now() where id=$1", [other]);
      await admin.query("insert into auth.invitations(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 hour')", [tokenHash(invitation), other]);
      const invited = jar(); assert.equal((await invited.auth.acceptInvitation(invitation)).error, null);
      assert.equal((await invited.auth.getUser()).data.user?.purpose, 'invitation');
      assert.deepEqual((await invited.finance.rpc('workspace_access')).data, []);
      assert.ok((await jar().auth.acceptInvitation(invitation)).error);
      const newPassword = 'test-only-replacement-password';
      assert.equal((await invited.auth.updateUser({ password: newPassword })).error, null);
      assert.equal((await second.auth.getUser()).data.user, null); assert.equal(invited.cookies.read(), undefined);
      assert.ok((await invited.auth.updateUser({ password: newPassword })).error);
      assert.equal((await invited.auth.signInWithPassword({ email: secondEmail, password: newPassword })).error, null);
    });
    await t.test("disabled/expired accounts and logout invalidate sessions immediately", async () => {
      await admin.query("update auth.users set disabled=true where id=$1", [user]);
      assert.equal((await first.auth.getUser()).data.user, null); assert.deepEqual((await first.finance.rpc('workspace_access')).data, []);
      const expired = second.cookies.read();
      if (expired) await admin.query("update auth.sessions set expires_at=now()-interval '1 second' where token_hash=$1", [tokenHash(expired)]);
      assert.equal((await second.auth.getUser()).data.user, null);
      assert.equal((await first.auth.signOut()).error, null); assert.equal(first.cookies.read(), undefined);
    });
  } finally { await raw.end(); await admin.end(); }
});
