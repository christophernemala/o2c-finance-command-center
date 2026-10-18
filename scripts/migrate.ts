import { createHash } from "node:crypto";
import { migrationChecksumMatches } from "../src/lib/postgres/migration-checksum";
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
    if (applied) { if (!migrationChecksumMatches(sql, applied.checksum)) throw new Error(`Applied migration checksum changed: ${name}`); continue; }
    await client.query("begin");
    try {
      // Keep upgrade diagnostics outside immutable, already-applied SQL history.
      if (name === "202610160005_collections_hardening.sql") await client.query(`-- Pre-flight: name the customers to clean up instead of failing inside the index build.
do $$
declare dupes text;
begin
  select string_agg(customer_id::text||' ('||n||')',', ') into dupes from (select customer_id,count(*) as n from public.collection_messages
    where status in ('pending','approved','sending') group by customer_id having count(*)>1) d;
  if dupes is not null then
    raise exception 'Cannot enforce one open collections message per customer. Reject or let all but one open message finish for: %', dupes;
  end if;
end $$;
`);
      await client.query(sql.replace(/^begin;\s*$/gm, "").replace(/^commit;\s*$/gm, ""));
      await client.query("insert into o2c_migrations.applied(name,checksum) values($1,$2)", [name, checksum]);
      await client.query("commit");
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      let rolledBack = false;
      try { await client.query("rollback"); rolledBack = true; } catch { /* Preserve the original migration failure. */ }
      throw new Error(`Migration failed: ${name}. ${rolledBack ? "Transaction rolled back." : "Rollback could not be confirmed."}`, { cause: error });
    }
  }
} finally { await client.end(); }
