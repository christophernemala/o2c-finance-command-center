import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp } from "../src/lib/login-limiter";
const settings = { url: "https://test.upstash.io", token: "test-only-token", secret: "test-only-secret-32-characters-long" };
test("durable limiter hashes identifiers, retains failures and releases only its successful attempt", async () => {
  const commands: unknown[][] = []; let count = 0;
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, settings.url); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${settings.token}`);
    const command = JSON.parse(options!.body as string); commands.push(command);
    assert.doesNotMatch(options!.body as string, /staff@example.invalid|192\.0\.2\.1/);
    return new Response(JSON.stringify({ result: command[0] === "ZREM" ? 1 : count++ === 0 ? [1, 0] : [0, 540] }));
  };
  const limiter = createLoginLimiter(settings, transport);
  const first = await limiter.reserve(" Staff@Example.invalid ", "192.0.2.1"); assert.ok(first.allowed);
  const second = await limiter.reserve("staff@example.invalid", "192.0.2.1"); assert.equal(second.allowed, false); assert.equal(second.retryAfter, 540);
  assert.equal(commands.length, 2); assert.equal(commands[0][3], commands[1][3]);
  assert.notEqual(commands[0][5], commands[1][5]);
  await limiter.succeed(first.ticket); assert.deepEqual(commands[2], ["ZREM", first.ticket.key, first.ticket.id]);
});
test("limiter fails closed on outages and malformed results", async () => {
  for (const result of [null, [1, -1], [1, 60], [0, 0], [0, 901], [2, 0], "OK"]) {
    const limiter = createLoginLimiter(settings, async () => new Response(JSON.stringify({ result })));
    await assert.rejects(limiter.reserve("staff@example.invalid", "192.0.2.1"));
  }
  await assert.rejects(createLoginLimiter(settings, async () => new Response("unavailable", { status: 503 })).reserve("x", "x"));
});
test("production trusts only the Vercel edge address and requires complete server configuration", () => {
  const headers = new Headers({ "x-forwarded-for": "192.0.2.100", "x-vercel-forwarded-for": "192.0.2.1" });
  assert.equal(trustedLoginIp(headers, { NODE_ENV: "production", VERCEL: "1" }), "192.0.2.1");
  assert.throws(() => trustedLoginIp(headers, { NODE_ENV: "production" }), /proxy/);
  assert.throws(() => trustedLoginIp(new Headers({ "x-forwarded-for": "192.0.2.1" }), { NODE_ENV: "production", VERCEL: "1" }), /address/);
  assert.equal(loginLimiterConfig({}), null);
  assert.equal(loginLimiterConfig({ UPSTASH_REDIS_REST_URL: "http://example.com", UPSTASH_REDIS_REST_TOKEN: settings.token, AUTH_RATE_LIMIT_SECRET: settings.secret }), null);
  assert.deepEqual(loginLimiterConfig({ UPSTASH_REDIS_REST_URL: settings.url, UPSTASH_REDIS_REST_TOKEN: settings.token, AUTH_RATE_LIMIT_SECRET: settings.secret }), settings);
});
