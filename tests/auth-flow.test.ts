import { test } from "node:test";
import assert from "node:assert/strict";
import { authSiteOrigin, authenticationAssurance, isAuthProvider, socialProviderAvailability, verifiedWorkspace } from "../src/lib/auth-flow";
import { signupPasswordSchema } from "../src/lib/validation";

test("OAuth accepts only supported providers and fixed safe application origins", () => {
  assert.ok(isAuthProvider("google")); assert.ok(isAuthProvider("azure"));
  for (const value of ["microsoft", "github", "https://evil.example", null]) assert.equal(isAuthProvider(value), false);
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "https://finance.example" }), "https://finance.example");
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "http://127.0.0.1:4174", NODE_ENV: "production", AUTH_LOGIN_IP_SOURCE: "loopback" }), "http://127.0.0.1:4174");
  for (const url of ["http://evil.example", "https://user:pass@finance.example", "https://finance.example/path", "https://finance.example?next=evil", "https://finance.example#evil", "//evil.example"]) assert.equal(authSiteOrigin({ AUTH_SITE_URL: url }), null);
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "http://127.0.0.1:4174", NODE_ENV: "production" }), null);
  assert.equal(authSiteOrigin({ AUTH_SITE_URL: "http://127.0.0.1:4174", AUTH_LOGIN_IP_SOURCE: "loopback", VERCEL: "1" }), null);
  assert.equal(authSiteOrigin({ VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:"finance-git-branch-team.vercel.app", AUTH_SITE_URL:"https://finance.example" }), "https://finance-git-branch-team.vercel.app");
  for (const host of ["evil.example","finance.vercel.app/evil","finance.vercel.app@evil.example",undefined]) assert.equal(authSiteOrigin({ VERCEL:"1", VERCEL_ENV:"preview", VERCEL_URL:host }),null);
});
test("provider availability requires actual enabled provider flags and fails closed", async () => {
  const config = { url: "https://project.supabase.co", key: "publishable-test-only" };
  const flags = await socialProviderAvailability(config, async (url, options) => {
    assert.equal(String(url), "https://project.supabase.co/auth/v1/settings");
    assert.equal(new Headers(options?.headers).get("apikey"), config.key);
    assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    return Response.json({ external: { google: true, azure: false } });
  });
  assert.deepEqual(flags, { google: true, azure: false });
  for (const reply of [null, {}, { external: null }, { external: { google: "true", azure: 1 } }]) {
    assert.deepEqual(await socialProviderAvailability(config, async () => Response.json(reply)), { google: false, azure: false });
  }
  assert.deepEqual(await socialProviderAvailability(config, async () => { throw new Error("offline"); }), { google: false, azure: false });
});
test("social authentication requires a server-verified confirmed identity and existing workspace membership", async () => {
  const tenant = "12345678-1234-4234-8234-123456789abc";
  for (const scenario of ["authorized", "pending", "rpc-error", "malformed", "unverified", "no-user", "user-error"] as const) {
    let rpcCalls = 0;
    const client = {
      auth: { getUser: async () => ({ data: { user: scenario === "no-user" ? null : { id: "verified-user", email_confirmed_at: scenario === "unverified" ? null : "2026-10-06T00:00:00Z" } }, error: scenario === "user-error" ? new Error("invalid") : null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) } },
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
