import { transaction, type SqlPool, type SqlConnection } from "./transaction";
import { tokenHash, validToken } from "../auth/crypto";
import type { AgentJob } from "../../components/agent-analysis";
// Only these fixed routines and parameter names can become SQL identifiers.
const routines = {
  workspace_access: [], workspace_entities: ["p_tenant"], workspace_snapshot: ["p_tenant", "p_entity", "p_as_of", "p_page"],
  propose_action: ["p_tenant", "p_entity", "p_id", "p_kind", "p_amount", "p_evidence", "p_invoice", "p_receipt", "p_bank", "p_customer"],
  decide_action: ["p_tenant", "p_entity", "p_id", "p_version", "p_decision"],
  execute_action: ["p_tenant", "p_entity", "p_id", "p_version"], stage_import: ["p_tenant", "p_entity", "p_kind", "p_name", "p_payload"],
  commit_import: ["p_tenant", "p_entity", "p_id"], enqueue_agent_job: ["p_tenant", "p_entity", "p_id", "p_agent", "p_as_of"],
  run_agent_job: ["p_tenant", "p_entity", "p_id"],
} as const;
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
        const values = keys.map(key => key === "p_payload" ? JSON.stringify(input[key]) : input[key] ?? null);
        const result = await scoped(connection => connection.query<{ value: unknown }>(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(",")}) as value`, values), typeof input.p_entity === "string" ? input.p_entity : undefined);
        return { data: result.rows[0]?.value ?? null, error: null };
      } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : "Database operation unavailable" } }; }
    },
    async agentJobs(tenant: string, entity: string) {
      return scoped(async connection => (await connection.query<AgentJob & Record<string, unknown>>(`select id,agent,status,requested_by,as_of::text,result,created_at::text from public.agent_jobs
        where tenant_id=$1 and entity_id=$2 order by created_at desc,id limit 51`, [tenant, entity])).rows, entity);
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
