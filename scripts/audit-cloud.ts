import { Pool } from "pg";
import { postgresConfig } from "../src/lib/postgres/config";
import { transaction } from "../src/lib/postgres/transaction";

// Operator-only, read-only qualification. Never prints URLs, identities or records.
const config = postgresConfig();
if (!config) throw new Error("Configure a restricted DATABASE_URL with verified TLS");
const pool = new Pool({ ...config, max: 1, connectionTimeoutMillis: 15000 });
try {
  const evidence = await transaction(pool, async connection => {
    const catalog = await connection.query<{ public_tables: string; without_rls: string }>(`
      select count(*)::text as public_tables,
        count(*) filter(where not c.relrowsecurity)::text as without_rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'`);
    await connection.query("SET LOCAL ROLE authenticated");
    const access = await connection.query<{ memberships: unknown; identity_read: boolean }>(`
      select public.workspace_access() as memberships,
        has_table_privilege(current_user,'auth.users','SELECT') as identity_read`);
    const row = access.rows[0];
    if (!row || !Array.isArray(row.memberships) || row.memberships.length !== 0 || row.identity_read) {
      throw new Error("Unauthenticated authorization qualification failed");
    }
    const tables = catalog.rows[0];
    if (!tables || tables.public_tables === "0" || tables.without_rls !== "0") {
      throw new Error("Financial RLS qualification failed");
    }
    return {
      checked_at: new Date().toISOString(),
      database_connection: "verified",
      runtime_role: "non-owner and without superuser/BYPASSRLS",
      public_tables: tables.public_tables,
      public_tables_without_rls: tables.without_rls,
      anonymous_memberships: 0,
      anonymous_identity_read: false,
      live_user_workflows: "unverified",
      autonomous_scheduler: "unverified",
      provider_execution: "unverified",
      production_ready: false,
    };
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await pool.end();
}
