export interface SqlConnection {
  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(error?: boolean): void;
}
export interface SqlPool { connect(): Promise<SqlConnection> }
/** SET LOCAL and rollback keep identity/role scoped to a single pooled transaction. */
export async function transaction<T>(pool: SqlPool, work: (connection: SqlConnection) => Promise<T>, sessionHash?: string): Promise<T> {
  const connection = await pool.connect(); let discard = false;
  try {
    const role = await connection.query<{ unsafe: boolean }>(`select r.rolsuper or r.rolbypassrls or
      exists(select 1 from pg_tables t where t.schemaname='public' and pg_has_role(current_user,t.tableowner,'MEMBER')) as unsafe
      from pg_roles r where r.rolname=current_user`);
    if (role.rows.length !== 1 || role.rows[0].unsafe !== false) throw new Error("Use a non-owner database application role");
    await connection.query("BEGIN");
    await connection.query("SET LOCAL statement_timeout = '15s'");
    await connection.query("SET LOCAL lock_timeout = '5s'");
    if (sessionHash !== undefined) {
      if (!/^[a-f0-9]{64}$/.test(sessionHash)) throw new Error("Invalid session");
      await connection.query("select set_config('o2c.session_hash', $1, true)", [sessionHash]);
      await connection.query("SET LOCAL ROLE authenticated");
    }
    const result = await work(connection);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    try { await connection.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { connection.release(discard); }
}
