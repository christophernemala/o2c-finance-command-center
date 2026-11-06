import { test } from "node:test";
import assert from "node:assert/strict";
import { authRequestOrigin, authSiteOrigin, authenticationAssurance, offHostSession, verifiedWorkspace } from "../src/lib/auth-flow";
import { signupPasswordSchema } from "../src/lib/validation";

test("authentication accepts only fixed safe application origins", () => {
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "https://finance.example" }), "https://finance.example");
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "http://127.0.0.1:4174", NODE_ENV: "production", AUTH_LOGIN_IP_SOURCE: "loopback" }), "http://127.0.0.1:4174");
  for (const url of ["http://evil.example", "https://user:pass@finance.example", "https://finance.example/path", "https://finance.example?next=evil", "https://finance.example#evil", "//evil.example"]) assert.equal(authSiteOrigin({ AUTH_SITE_URL: url }), null);
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "http://127.0.0.1:4174", NODE_ENV: "production" }), null);
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "http://127.0.0.1:4174", AUTH_LOGIN_IP_SOURCE: "loopback", VERCEL: "1" }), null);
  assert.equal(authSiteOrigin({ VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:"finance-git-branch-team.vercel.app", AUTH_SITE_URL:"https://finance.example" }), "https://finance-git-branch-team.vercel.app");
  for (const host of ["evil.example","finance.vercel.app/evil","finance.vercel.app@evil.example",undefined]) assert.equal(authSiteOrigin({ VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:host }),null);
  // The stable branch URL wins over the per-deployment URL, so OAuth redirect URIs survive new pushes.
  assert.equal(authSiteOrigin({ VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:"finance-abc123-team.vercel.app", VERCEL_BRANCH_URL:"finance-git-branch-team.vercel.app" }), "https://finance-git-branch-team.vercel.app");
  for (const host of ["evil.example","finance.vercel.app/evil"]) assert.equal(authSiteOrigin({ VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:"finance-abc123-team.vercel.app", VERCEL_BRANCH_URL:host }),null, "an invalid branch URL never falls back silently");
});
test("auth forms accept both preview hosts and keep the user on the host they used", () => {
  const preview = { VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:"finance-abc123-team.vercel.app", VERCEL_BRANCH_URL:"finance-git-branch-team.vercel.app" };
  assert.equal(authRequestOrigin("https://finance-git-branch-team.vercel.app", preview), "https://finance-git-branch-team.vercel.app");
  assert.equal(authRequestOrigin("https://finance-abc123-team.vercel.app", preview), "https://finance-abc123-team.vercel.app", "the per-deployment URL is the host Vercel served");
  for (const origin of ["https://evil.vercel.app", "http://finance-abc123-team.vercel.app", "https://finance-abc123-team.vercel.app.evil.example", "null", null]) assert.equal(authRequestOrigin(origin, preview), null);
  // Production accepts only the configured site, even when a deployment URL is injected.
  const production = { VERCEL:"1", VERCEL_ENV:"production", VERCEL_URL:"finance-abc123-team.vercel.app", AUTH_SITE_URL:"https://finance.example" };
  assert.equal(authRequestOrigin("https://finance.example", production), "https://finance.example");
  assert.equal(authRequestOrigin("https://finance-abc123-team.vercel.app", production), null);
  assert.equal(authRequestOrigin("https://finance-abc123-team.vercel.app", { ...preview, VERCEL_URL:"evil.example" }), null);
  assert.equal(authRequestOrigin("https://finance.example", {}), null, "no configured site means no auth origin");
});
test("authentication requires a server-verified confirmed identity and existing workspace membership", async () => {
  const tenant = "12345678-1234-4234-8234-123456789abc";
  for (const scenario of ["authorized", "pending", "rpc-error", "malformed", "unverified", "no-user", "user-error"] as const) {
    let rpcCalls = 0;
    const client = {
      auth: { getUser: async () => ({ data: { user: scenario === "no-user" ? null : { id: "verified-user", purpose: "login", email_confirmed_at: scenario === "unverified" ? null : "2026-10-06T00:00:00Z" } }, error: scenario === "user-error" ? new Error("invalid") : null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) } },
      rpc: async (name: string) => { rpcCalls++; assert.equal(name, "workspace_access"); return { error: scenario === "rpc-error" ? new Error("offline") : null, data: scenario === "pending" ? [] : scenario === "malformed" ? [{ tenant_id: "https://evil.example" }] : [{ tenant_id: tenant }] }; },
    } as unknown as Parameters<typeof verifiedWorkspace>[0];
    const result = await verifiedWorkspace(client);
    if (scenario === "authorized") assert.deepEqual(result, { state: "authorized", tenantId: tenant });
    else if (scenario === "pending" || scenario === "malformed") assert.equal(result.state, "pending");
    else if (scenario === "rpc-error") assert.equal(result.state, "unavailable");
    else { assert.equal(result.state, "invalid"); assert.equal(rpcCalls, 0); }
  }
});
test("invitation password setup rejects weak or mismatched passwords", () => {
  assert.equal(signupPasswordSchema.safeParse({ password: "short", confirm: "short" }).success, false);
  assert.equal(signupPasswordSchema.safeParse({ password: "test-only-password", confirm: "different-password" }).success, false);
  assert.equal(signupPasswordSchema.safeParse({ password: "test-only-password", confirm: "test-only-password" }).success, true);
});
test("second-factor assurance requires provider evidence and fails closed on errors", async () => {
  for (const [current,next,expected] of [["aal1","aal1","ready"],["aal1","aal2","mfa"],["aal2","aal2","ready"],[null,null,"unavailable"]]) {
    const client={auth:{mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:current,nextLevel:next},error:null})}}} as unknown as Parameters<typeof authenticationAssurance>[0];
    assert.equal(await authenticationAssurance(client),expected);
  }
});

test("off-host provider requests never query sessions before the IP limiter", async () => {
  const calls: string[] = [];
  const deps = (opts: { cookie: boolean; allowed?: boolean; live?: boolean | "throw" }) => ({
    hasCookie: opts.cookie,
    reserve: async () => { calls.push("reserve"); return { allowed: opts.allowed ?? true, retryAfter: opts.allowed === false ? 42 : 0, release: async () => { calls.push("release"); } }; },
    lookup: async () => { calls.push("lookup"); if (opts.live === "throw") throw new Error("db down"); return opts.live ?? false; },
  });
  calls.length = 0;
  assert.deepEqual(await offHostSession(deps({ cookie: false })), { state: "signed-out" });
  assert.deepEqual(calls, [], "no cookie: no limiter call and no database query");
  calls.length = 0;
  assert.deepEqual(await offHostSession(deps({ cookie: true, allowed: false })), { state: "limited", retryAfter: 42 });
  assert.deepEqual(calls, ["reserve"], "over budget: the session is never looked up");
  calls.length = 0;
  assert.deepEqual(await offHostSession(deps({ cookie: true, live: false })), { state: "signed-out" });
  assert.deepEqual(calls, ["reserve", "lookup"], "a forged or stale cookie keeps its slot");
  calls.length = 0;
  assert.deepEqual(await offHostSession(deps({ cookie: true, live: "throw" })), { state: "signed-out" });
  assert.deepEqual(calls, ["reserve", "lookup"], "a failed lookup is treated as signed out and keeps its slot");
  calls.length = 0;
  assert.deepEqual(await offHostSession(deps({ cookie: true, live: true })), { state: "signed-in" });
  assert.deepEqual(calls, ["reserve", "lookup", "release"], "a real session returns its slot");
  await assert.rejects(offHostSession({ hasCookie: true, reserve: async () => { throw new Error("limiter down"); }, lookup: async () => { throw new Error("must not run"); } }), /limiter down/, "a limiter outage propagates so the route fails closed");
});
