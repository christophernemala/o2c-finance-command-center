import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginLimiter, loginLimiterConfig, trustedLoginIp, sealReservation, openReservation } from "../src/lib/login-limiter";
const settings = { url: "https://test.upstash.io", token: "test-only-token", secret: "test-only-secret-32-characters-long" };
test("OAuth and MFA reservations cannot be changed or signed with another key", () => {
  const ticket={key:`o2c:{login}:account:${"a".repeat(64)}`,ipKey:`o2c:{login}:ip:${"b".repeat(64)}`,id:"00000000-0000-4000-8000-000000000001"};
  const signed=sealReservation(ticket,settings.secret);
  assert.deepEqual(openReservation(signed,settings.secret),ticket);
  assert.equal(openReservation(signed,"another-key"),null); assert.equal(openReservation(`x${signed}`,settings.secret),null);
  assert.equal(openReservation(sealReservation({...ticket,key:"another-application"},settings.secret),settings.secret),null);
});
test("durable limiter hashes identifiers, retains failures and releases only its successful attempt", async () => {
  const commands: unknown[][] = []; let count = 0;
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, settings.url); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    assert.equal(new Headers(options?.headers).get("Authorization"), `Bearer ${settings.token}`);
    const command = JSON.parse(options!.body as string); commands.push(command);
    assert.doesNotMatch(options!.body as string, /staff@example.invalid|192\.0\.2\.1/);
    return new Response(JSON.stringify({ result: command[1].includes("ZADD") ? count++ === 0 ? [1, 0] : [0, 540] : 2 }));
  };
  const limiter = createLoginLimiter(settings, transport);
  const first = await limiter.reserve(" Staff@Example.invalid ", "192.0.2.1"); assert.ok(first.allowed);
  const second = await limiter.reserve("staff@example.invalid", "192.0.2.1"); assert.equal(second.allowed, false); assert.equal(second.retryAfter, 540);
  assert.equal(commands.length, 2); assert.equal(commands[0][3], commands[1][3]);
  assert.notEqual(commands[0][5], commands[1][5]);
  await limiter.succeed(first.ticket);
  assert.equal(commands[2][0], "EVAL"); assert.match(String(commands[2][1]), /ZREM/);
  assert.deepEqual(commands[2].slice(2), [2, first.ticket.key, first.ticket.ipKey, first.ticket.id]);
});
test("successful NAT sign-ins release both budgets without clearing other failures", async () => {
  const slots = new Map<string, Set<string>>();
  const transport: typeof fetch = async (_url, options) => {
    const [op, script, count, ...args] = JSON.parse(options!.body as string) as (string | number)[];
    assert.equal(op, "EVAL"); assert.equal(count, 2);
    const [account, ip, ticket] = args.map(String);
    const keys = [account, ip].map(key => {
      if (!slots.has(key)) slots.set(key, new Set());
      return slots.get(key)!;
    });
    let result: number | number[];
    if (String(script).includes("ZADD")) {
      result = keys[0].size >= 5 || keys[1].size >= 30 ? [0, 900] : [1, 0];
      if (result[0] === 1) keys.forEach(set => set.add(ticket));
    } else {
      result = keys.reduce((removed, set) => removed + Number(set.delete(ticket)), 0);
    }
    return new Response(JSON.stringify({ result }));
  };
  const limiter = createLoginLimiter(settings, transport);
  const failed = await limiter.reserve("failed@example.invalid", "192.0.2.1");
  for (let i = 0; i < 35; i++) {
    const success = await limiter.reserve(`staff${i}@example.invalid`, "192.0.2.1");
    assert.ok(success.allowed); await limiter.succeed(success.ticket);
    await limiter.succeed(success.ticket); // Idempotent release.
  }
  assert.equal(slots.get(failed.ticket.ipKey)?.size, 1);
  assert.ok(slots.get(failed.ticket.key)?.has(failed.ticket.id));
  for (let i = 0; i < 29; i++) assert.ok((await limiter.reserve(`failed${i}@example.invalid`, "192.0.2.1")).allowed);
  assert.equal((await limiter.reserve("next@example.invalid", "192.0.2.1")).allowed, false);
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
