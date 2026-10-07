import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLoginLimiter, loginLimiterConfig } from "../src/lib/login-limiter";

// Explicit opt-in integration check; not included in the default unit-test glob.
// Use `node --env-file=.env.local --import tsx tests/login-limiter.integration.ts`.
// A unique HMAC namespace leaves only isolated, automatically expiring test slots.
const configured = loginLimiterConfig();
if (!configured) throw new Error("A configured dedicated Redis database is required");
const limiter = createLoginLimiter({ ...configured, secret: `${configured.secret}:${randomUUID()}` });
const tickets = [];
for (let index = 0; index < 5; index++) {
  const attempt = await limiter.reserve("limiter-fixture@example.invalid", "192.0.2.221");
  assert.ok(attempt.allowed); tickets.push(attempt.ticket);
}
const denied = await limiter.reserve("limiter-fixture@example.invalid", "192.0.2.221");
assert.equal(denied.allowed, false); assert.ok(denied.retryAfter > 0 && denied.retryAfter <= 900);
await limiter.succeed(tickets[0]);
const concurrent = await Promise.all([
  limiter.reserve("limiter-fixture@example.invalid", "192.0.2.221"),
  limiter.reserve("limiter-fixture@example.invalid", "192.0.2.221"),
]);
assert.equal(concurrent.filter(result => result.allowed).length, 1);
for (let index = 0; index < 29; index++) assert.ok((await limiter.reserveIp("192.0.2.222")).allowed);
assert.ok((await limiter.reserve("different-fixture@example.invalid", "192.0.2.222")).allowed);
const ipDenied = await limiter.reserveIp("192.0.2.222");
assert.equal(ipDenied.allowed, false); assert.ok(ipDenied.retryAfter > 0 && ipDenied.retryAfter <= 900);
console.log("Live Redis passed: account limit, concurrent reservation, successful-slot release, shared OAuth/password IP limit and Retry-After. Test keys expire automatically; no Auth users or financial data were created.");
