import { transaction, type SqlPool, type SqlConnection } from "./transaction";
import { tokenHash, validToken } from "../auth/crypto";
// Only these fixed routines and parameter names can become SQL identifiers.
const routines = {
  workspace_access: [], workspace_entities: ["p_tenant"], workspace_snapshot: ["p_tenant", "p_entity", "p_as_of", "p_page"],
  propose_action: ["p_tenant", "p_entity", "p_id", "p_kind", "p_amount", "p_evidence", "p_invoice", "p_receipt", "p_bank", "p_customer"],
  decide_action: ["p_tenant", "p_entity", "p_id", "p_version", "p_decision"],
  execute_action: ["p_tenant", "p_entity", "p_id", "p_version"], stage_import: ["p_tenant", "p_entity", "p_kind", "p_name", "p_payload"],
  commit_import: ["p_tenant", "p_entity", "p_id"],
  request_agent_run: ["p_tenant", "p_entity", "p_id", "p_kind", "p_as_of"],
  agent_record_step: ["p_tenant", "p_entity", "p_run", "p_type", "p_tool", "p_detail", "p_duration"],
  agent_finish_run: ["p_tenant", "p_entity", "p_run", "p_status", "p_summary", "p_model", "p_input_tokens", "p_output_tokens", "p_cache_read_tokens", "p_cost", "p_error"],
  agent_auto_post: ["p_tenant", "p_entity", "p_id"],
  propose_agent_policy: ["p_tenant", "p_entity", "p_id", "p_auto", "p_item_limit", "p_daily_limit"],
  decide_agent_policy: ["p_tenant", "p_entity", "p_id", "p_decision"],
  set_agent_schedule: ["p_tenant", "p_entity", "p_kind", "p_cadence"],
  agent_ar_overview: ["p_tenant", "p_entity", "p_as_of"],
  agent_invoices: ["p_tenant", "p_entity", "p_as_of", "p_filter", "p_search", "p_limit", "p_offset"],
  agent_cash_candidates: ["p_tenant", "p_entity", "p_limit"],
  report_ar_pack: ["p_tenant", "p_entity", "p_as_of"],
  agent_console: ["p_tenant", "p_entity"], agent_run_detail: ["p_tenant", "p_entity", "p_run", "p_after"],
  copilot_append: ["p_tenant", "p_entity", "p_thread", "p_role", "p_content", "p_trace"],
  copilot_history: ["p_tenant", "p_entity", "p_thread"], copilot_threads_list: ["p_tenant", "p_entity"],
  copilot_attach: ["p_tenant", "p_entity", "p_id", "p_name", "p_media_type", "p_content"],
  copilot_file: ["p_tenant", "p_entity", "p_id"],
} as const;
// jsonb parameters are serialized once here; everything else binds as a scalar.
const jsonParameters = new Set(["p_payload", "p_detail", "p_trace"]);
export type Routine = keyof typeof routines;
export interface ImportBatch extends Record<string, unknown> { id: string; kind: string; file_name: string; digest: string; payload: Record<string, string>[]; rows: number; status: string; maker: string }
export function financeClient(pool: SqlPool, session: () => string | undefined) {
  const scoped = <T>(work: (connection: SqlConnection) => Promise<T>, entity?: string) => {
    const token = session(); if (!validToken(token)) throw new Error("Unauthenticated");
    if (entity !== undefined && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(entity)) throw new Error("Invalid entity scope");
    return transaction(pool, async connection => {
      // Clear/reconstruct source-file scope on every pooled transaction.
      await connection.query("select set_config('o2c.entity_id',$1,true)", [entity?.toLowerCase() ?? ""]);
      return work(connection);
    }, tokenHash(token));
  };
  return {
    async rpc(name: Routine, input: Record<string, unknown> = {}): Promise<{ data: unknown; error: { message: string } | null }> {
      try {
        if (!Object.hasOwn(routines, name)) throw new Error("Unsupported routine");
        const keys: readonly string[] = routines[name];
        if (Object.keys(input).some(key => !keys.includes(key))) throw new Error("Unsupported argument");
        const values = keys.map(key => jsonParameters.has(key) ? JSON.stringify(input[key] ?? null) : input[key] ?? null);
        const result = await scoped(connection => connection.query<{ value: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`, values), typeof input.p_entity === "string" ? input.p_entity : undefined);
        return { data: result.rows[0]?.value ?? null, error: null };
      } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Database operation unavailable" } }; }
    },
    async importBatch(id: string, tenant: string, entity: string) {
      return scoped(async connection => (await connection.query<ImportBatch>("select id,kind,file_name,digest,payload,rows,status,maker from public.import_batches where id=$1 and tenant_id=$2 and entity_id=$3", [id, tenant, entity])).rows[0] ?? null, entity);
    },
    async stageSource(input: { tenant: string; entity: string; userId: string; digest: string; name: string; bytes: Uint8Array; kind: string; rows: Record<string, string>[] }) {
      // Original bytes and staged rows commit together; a failed stage leaves no orphan archive.
      return scoped(async connection => {
        await connection.query(`insert into public.source_files(tenant_id,entity_id,uploaded_by,digest,original_name,content)
          values($1,$2,$3,$4,$5,$6) on conflict do nothing`, [input.tenant, input.entity, input.userId, input.digest, input.name.slice(0, 200), Buffer.from(input.bytes)]);
        return (await connection.query<{ value: string }>("select public.stage_import($1,$2,$3,$4,$5::jsonb) as value", [input.tenant, input.entity, input.kind, input.name.slice(0, 200), JSON.stringify(input.rows)])).rows[0].value;
      }, input.entity);
    },
  };
}

/** Trusted server-role operations (no user session). Only the agent runner and cron route call these. */
export function agentControl(pool: SqlPool) {
  return {
    async claim(run: string, sessionHash: string) {
      return transaction(pool, async connection => (await connection.query<{ value: ClaimedRun | null }>("select o2c_private.claim_agent_run($1,$2) as value", [run, sessionHash])).rows[0]?.value ?? null);
    },
    async scheduleDue(asOf: string) {
      return transaction(pool, async connection => (await connection.query<{ value: string }>("select o2c_private.schedule_due_runs($1) as value", [asOf])).rows.map(row => row.value));
    },
  };
}
export interface ClaimedRun { id: string; tenant_id: string; entity_id: string; kind: AgentKind; as_of: string; trigger: "manual" | "schedule"; agent_user: string }
export type AgentKind = "collections" | "cash_application" | "credit_risk" | "reporting";
