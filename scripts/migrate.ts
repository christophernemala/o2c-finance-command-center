import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
import { postgresConfig } from "../src/lib/postgres/config";
const settings = postgresConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_MIGRATION_URL });
if (!settings) throw new Error("Set DATABASE_MIGRATION_URL for a dedicated standalone database");
const client = new Client(settings);
try {
  await client.connect();
  await client.query("select pg_advisory_lock(20261013, 1)");
  await client.query("create schema if not exists o2c_migrations");
  await client.query("revoke all on schema o2c_migrations from public");
  await client.query("create table if not exists o2c_migrations.applied(name text primary key, checksum text not null, applied_at timestamptz not null default now())");
  const directory = new URL("../postgres/migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(name, directory), "utf8"); const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = (await client.query("select checksum from o2c_migrations.applied where name=$1", [name])).rows[0];
    if (applied) { if (applied.checksum !== checksum) throw new Error(`Applied migration checksum changed: ${name}`); continue; }
    await client.query("begin");
    try {
      await client.query(sql.replace(/^begin;\s*$/gm, "").replace(/^commit;\s*$/gm, ""));
      await client.query("insert into o2c_migrations.applied(name,checksum) values($1,$2)", [name, checksum]);
      await client.query("commit");
      process.stdout.write(`Applied ${name}\n`);
    } catch { await client.query("rollback"); throw new Error(`Migration failed: ${name}. Transaction rolled back.`); }
  }
} finally { await client.end(); }
