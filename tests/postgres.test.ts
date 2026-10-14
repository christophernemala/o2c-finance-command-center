import { test } from "node:test";
import assert from "node:assert/strict";
import { hash as bcryptHash } from "bcryptjs";
import { postgresConfig } from "../src/lib/postgres/config";
import { transaction, type SqlPool } from "../src/lib/postgres/transaction";
import { decryptSecret, encryptSecret, generateFactor, hashPassword, tokenHash, totp, validToken, verifiedCounter, verifyPassword } from "../src/lib/auth/crypto";
import { financeClient } from "../src/lib/postgres/client";

test("PostgreSQL configuration verifies remote TLS and keeps credentials server-side", () => {
  assert.equal(postgresConfig({}), null);
  for (const url of ["https://db.example", "postgres://db.example/db", "postgres://user@db.example/db?sslmode=disable", "postgres://user@db.example/db?sslmode=no-verify"]) assert.equal(postgresConfig({ DATABASE_URL: url }), null);
  const remote = postgresConfig({ DATABASE_URL: "postgresql://runtime:secret@db.example/finance?sslmode=verify-full&sslrootcert=ignored" });
  assert.ok(remote); assert.deepEqual(remote.ssl, { rejectUnauthorized: true }); assert.ok(!remote.connectionString.includes("sslmode"));
  assert.equal(postgresConfig({ DATABASE_URL: "postgresql://runtime@127.0.0.1/finance?sslmode=disable" })?.ssl, false);
});

test("passwords use bounded scrypt hashes and can verify imported bcrypt credentials", async () => {
  const password = "test-only-long-password"; const first = await hashPassword(password); const second = await hashPassword(password);
  assert.notEqual(first, second); assert.ok(first.startsWith("scrypt$65536$8$1$"));
  assert.equal(await verifyPassword(password, first), true); assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword(password, null), false); assert.equal(await verifyPassword(password, "scrypt$999999999$8$1$invalid"), false);
  assert.equal(await verifyPassword(password, await bcryptHash(password, 10)), true);
});

test("TOTP secrets are encrypted for their owner and verified counters prevent replay", () => {
  const key = Buffer.alloc(32, 7); const factor = generateFactor("test-only@example.test"); const user = "test-only-owner";
  const encrypted = encryptSecret(factor.secret, key, user); assert.ok(!encrypted.includes(factor.secret));
  assert.equal(decryptSecret(encrypted, key, user), factor.secret);
  assert.throws(() => decryptSecret(encrypted, Buffer.alloc(32, 8), user)); assert.throws(() => decryptSecret(encrypted, key, "other-owner"));
  const timestamp = Date.UTC(2026, 9, 13, 12); const code = totp(factor.secret, "test-only@example.test").generate({ timestamp });
  const counter = verifiedCounter(factor.secret, code, -1n, timestamp); assert.ok(counter !== null);
  assert.equal(verifiedCounter(factor.secret, code, counter, timestamp), null);
  assert.equal(verifiedCounter(factor.secret, "123", -1n, timestamp), null);
  assert.ok(validToken("A".repeat(43))); assert.equal(validToken("A".repeat(44)), false);
  assert.equal(tokenHash("A".repeat(43)).length, 64);
});

test("pooled transactions scope identity locally and rollback failures before reuse", async () => {
  const calls: { sql: string; values?: unknown[] }[] = []; let released: boolean | undefined;
  const pool = { connect: async () => ({ query: async (sql: string, values?: unknown[]) => { calls.push({ sql, values }); return { rows: sql.includes("pg_roles") ? [{ unsafe: false }] : [] }; }, release: (discard: boolean) => { released = discard; } }) } as unknown as SqlPool;
  const hash = "f".repeat(64);
  await assert.rejects(transaction(pool, async () => { throw new Error("test failure"); }, hash), /test failure/);
  assert.ok(calls.some(call => call.sql === "SET LOCAL ROLE authenticated"));
  assert.deepEqual(calls.find(call => call.sql.includes("set_config"))?.values, [hash]);
  assert.equal(calls.at(-1)?.sql, "ROLLBACK"); assert.equal(released, false);
});

test("finance access rejects SQL identifier injection before executing queries", async () => {
  let connections = 0;
  const client = financeClient({ connect: async () => { connections++; throw new Error("unexpected connection"); } }, () => "A".repeat(43));
  assert.ok((await client.rpc("workspace_access();drop table invoices" as "workspace_access")).error);
  assert.ok((await client.rpc("workspace_access", { "p_id);drop table invoices": 1 })).error);
  assert.equal(connections, 0);
});
