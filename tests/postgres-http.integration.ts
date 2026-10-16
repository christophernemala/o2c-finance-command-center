/** Explicit local HTTP smoke check. PostgreSQL is real; Redis transport is mocked. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { decryptSecret, totp } from "../src/lib/auth/crypto";
const adminUrl = new URL(process.env.POSTGRES_TEST_ADMIN_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(adminUrl.hostname) || !adminUrl.pathname.startsWith("/o2c_migration_test")) throw new Error("Use a disposable local PostgreSQL test database");
const runtime = new URL(adminUrl); runtime.username = "o2c_test_runtime";
const origin = "http://127.0.0.1:4187";
const key = randomBytes(32);
const serverEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", AUTH_LOGIN_IP_SOURCE: "loopback", AUTH_SITE_URL: origin,
  DATABASE_URL: runtime.toString(), MFA_ENCRYPTION_KEY: key.toString("base64"),
  UPSTASH_REDIS_REST_URL: "https://o2c-http-test.upstash.io", UPSTASH_REDIS_REST_TOKEN: "test-only-token", AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString("base64"),
  GOOGLE_CLIENT_ID:"", GOOGLE_CLIENT_SECRET:"", MICROSOFT_CLIENT_ID:"", MICROSOFT_CLIENT_SECRET:"", MICROSOFT_TENANT_ID:"",
  O2C_HTTP_TEST: "1", NODE_OPTIONS: `--import tsx --import ${new URL("./http-redis-stub.ts", import.meta.url).pathname}` };
const admin = new Pool({ connectionString: adminUrl.toString() });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4187"], { env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
server.stdout.on("data", chunk => { output += chunk; }); server.stderr.on("data", chunk => { output += chunk; });
function browser() {
  const cookies = new Map<string, string>();
  return { cookies, async request(path: string, form?: Record<string, string>, requestOrigin = origin) {
    const response = await fetch(new URL(path, origin), { redirect: "manual", ...(form ? { method: "POST", body: new URLSearchParams(form) } : {}), headers: {
      ...(form ? { origin: requestOrigin } : {}), cookie: [...cookies].map(([name,value]) => `${name}=${value}`).join("; "),
    } });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0]; const index = pair.indexOf("=");
      const name = pair.slice(0, index); const value = pair.slice(index + 1);
      if (/max-age=0/i.test(header) || !value) cookies.delete(name); else cookies.set(name, value);
    }
    return response;
  } };
}
test("standalone Next.js invitation, login cookies, MFA and logout over HTTP", async t => {
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error(`Test server exited: ${output}`);
      try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break; } } catch { /* Startup in progress. */ }
      await delay(100);
    }
    assert.ok(ready, "Local Next.js server started");
    await t.test("detailed registration stores a private request and verifies its receipt; providers fail closed", async () => {
      const applicant=browser();const requestEmail=`registration-${randomUUID()}@example.test`;
      const details={id:randomUUID(),full_name:"HTTP registration applicant",email:requestEmail,company:"HTTP registration company",job_title:"Credit controller",phone:"+971501234567",country:"United Arab Emirates",company_size:"11–50",interest:"collections",description:"Test-only collections access request",consent:"yes"};
      assert.equal((await applicant.request("/api/auth/register",details,"https://attacker.example")).status,403);
      const spoofed=await browser().request("/signup?message=requested");assert.ok(!(await spoofed.text()).includes("Your request has been received"));
      const submitted=await applicant.request("/api/auth/register",details);assert.equal(submitted.status,303);
      const receipt=await applicant.request("/signup?message=requested");assert.ok((await receipt.text()).includes("Your request has been received"));
      assert.equal((await admin.query("select company from auth.registration_requests where email=$1",[requestEmail])).rows[0].company,"HTTP registration company");
      assert.equal((await admin.query("select id from auth.users where email=$1",[requestEmail])).rows.length,0);
      assert.equal((await applicant.request("/api/auth/oidc/google",{intent:"signin"})).status,503);
      const invalidCallback=await applicant.request("/api/auth/oidc/google/callback?state=invalid");assert.equal(invalidCallback.status,303);assert.equal(new URL(invalidCallback.headers.get("location")!).pathname,"/login");
    });
    const tenant = randomUUID(); const email = `http-${randomUUID()}@example.test`;
    await admin.query("insert into public.tenants(id,name) values($1,'test-only HTTP tenant')", [tenant]);
    await admin.query("insert into public.entities(tenant_id,name) values($1,'test-only HTTP entity')", [tenant]);
    const invitationOutput = execFileSync(process.execPath, ["--import", "tsx", "scripts/invite.ts", email, tenant, "admin"], {
      env: { ...serverEnv, DATABASE_MIGRATION_URL: adminUrl.toString() }, encoding: "utf8",
    });
    const link = invitationOutput.split("\n").find(line => line.startsWith(origin)); assert.ok(link);
    const user = (await admin.query("select id from auth.users where email=$1", [email])).rows[0].id;
    const page = browser(); const password = "test-only-HTTP-password";
    await t.test("operator invitation activates exactly one account without finance access", async () => {
      const url = new URL(link); const token = url.searchParams.get("token")!;
      for (let scan = 0; scan < 2; scan++) {
        const landing = await browser().request(url.pathname + url.search);
        assert.equal(landing.status, 200); assert.ok((await landing.text()).includes("Continue activation"));
        assert.equal(landing.headers.get("referrer-policy"), "strict-origin");
        assert.equal(landing.headers.getSetCookie().length, 0);
      }
      assert.equal((await admin.query("select consumed_at from auth.invitations where user_id=$1", [user])).rows[0].consumed_at, null);
      const attack = await browser().request("/auth/confirm", { type: "invite", token }, "https://attacker.example");
      assert.equal(attack.status, 403);
      assert.equal((await admin.query("select consumed_at from auth.invitations where user_id=$1", [user])).rows[0].consumed_at, null);
      const confirm = await page.request("/auth/confirm", { type: "invite", token });
      assert.equal(confirm.status, 303); assert.equal(new URL(confirm.headers.get("location")!).pathname, "/signup");
      assert.equal(confirm.headers.get("referrer-policy"), "strict-origin");
      assert.ok(confirm.headers.getSetCookie().some(cookie => /HttpOnly/i.test(cookie)));
      const incomplete = await page.request("/api/auth/signup", { password, confirm: password });
      assert.equal(new URL(incomplete.headers.get("location")!).searchParams.get("error"), "details");
      const activation = await page.request("/api/auth/signup", { password, confirm: password,
        id: randomUUID(), full_name: "HTTP test applicant", email, company: "HTTP test company", job_title: "Finance manager",
        phone: "+971501234567", country: "United Arab Emirates", company_size: "11–50", interest: "collections",
        description: "Test-only receivables workflow", consent: "yes" });
      assert.equal(activation.status, 303); assert.equal(new URL(activation.headers.get("location")!).pathname, "/login");
      assert.equal(page.cookies.has("o2c-session"), false);
      const repeat = await browser().request(url.pathname + url.search);
      assert.equal(new URL(repeat.headers.get("location")!).searchParams.get("error"), "invite");
    });
    await t.test("login establishes a private session, renders a scoped workspace, and rejects CSRF", async () => {
      const login = await page.request("/api/auth", { email, password });
      assert.equal(login.status, 303); assert.equal(new URL(login.headers.get("location")!).pathname, "/dashboard");
      const cookie = login.headers.getSetCookie().find(cookie => cookie.startsWith("o2c-session=")); assert.ok(cookie);
      assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
      const workspace = await page.request("/"); assert.equal(workspace.status, 200); assert.ok((await workspace.text()).includes("test-only HTTP tenant"));
      const entityId = (await admin.query("select id from public.entities where tenant_id=$1", [tenant])).rows[0].id;
      const invalidBatch = await page.request(`/imports/not-a-uuid?tenant=${tenant}&entity=${entityId}`);
      assert.equal(invalidBatch.status, 404);
      assert.equal(workspace.headers.get("cache-control"), "private, no-store");
      assert.equal((await page.request("/api/auth", { intent: "logout" }, "https://attacker.example")).status, 403);
    });
    let factorId = ""; let secret = "";
    await t.test("MFA enrollment verifies a code and displays enabled security settings", async () => {
      const enrollment = await page.request("/api/auth/enroll", { intent: "enroll" }); assert.equal(enrollment.status, 303);
      const security = await page.request("/auth/security"); assert.equal(security.status, 200); const html = await security.text();
      const factor = (await admin.query("select id,secret_ciphertext from auth.mfa_factors where user_id=$1", [user])).rows[0];
      factorId = factor.id; secret = decryptSecret(factor.secret_ciphertext, key, user); assert.ok(html.includes(secret));
      const code = totp(secret, email).generate({ timestamp: Date.now() - 30000 });
      const verification = await page.request("/api/auth/enroll", { intent: "verify", factor: factorId, code });
      assert.equal(new URL(verification.headers.get("location")!).searchParams.get("message"), "enabled");
      assert.ok((await (await page.request("/auth/security")).text()).includes("Authenticator verification is enabled"));
    });
    await t.test("password login requires MFA; completing it rotates the cookie and logout revokes it", async () => {
      const pending = browser(); const login = await pending.request("/api/auth", { email, password });
      assert.equal(new URL(login.headers.get("location")!).pathname, "/auth/verify");
      const protectedPage = await pending.request("/");
      if (protectedPage.status === 307) assert.equal(new URL(protectedPage.headers.get("location")!, origin).pathname, "/auth/verify");
      else {
        // Next can stream a 200 with a redirect instruction before page data renders.
        assert.equal(protectedPage.status, 200); const html = await protectedPage.text();
        assert.ok(html.includes("/auth/verify")); assert.ok(!html.includes("test-only HTTP tenant"));
      }
      const before = pending.cookies.get("o2c-session");
      const code = totp(secret, email).generate(); const verified = await pending.request("/api/auth/mfa", { factor: factorId, code });
      assert.equal(new URL(verified.headers.get("location")!).pathname, "/dashboard"); assert.notEqual(pending.cookies.get("o2c-session"), before);
      const logout = await pending.request("/api/auth", { intent: "logout" }); assert.equal(logout.status, 303); assert.equal(pending.cookies.has("o2c-session"), false);
      assert.equal((await admin.query("select token_hash from auth.sessions where user_id=$1 and token_hash=encode(sha256(convert_to($2,'UTF8')),'hex')", [user, before])).rowCount, 0);
    });
  } finally {
    server.kill("SIGTERM"); await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
    await admin.end();
  }
});
