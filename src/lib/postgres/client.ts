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
  propose_guardrail: ["p_tenant", "p_entity", "p_id", "p_name", "p_kind", "p_agent_kind", "p_params", "p_simulation"],
  propose_guardrail_stage: ["p_tenant", "p_entity", "p_id", "p_version", "p_stage", "p_simulation"],
  decide_guardrail_stage: ["p_tenant", "p_entity", "p_id", "p_version", "p_decision"],
  simulate_guardrail: ["p_tenant", "p_entity", "p_kind", "p_agent_kind", "p_params", "p_days"],
  resolve_agent_incident: ["p_tenant", "p_entity", "p_id"],
  agent_guardrails_active: ["p_tenant", "p_entity", "p_agent_kind"], agent_guardrails_list: ["p_tenant", "p_entity"],
  agent_incidents_list: ["p_tenant", "p_entity", "p_status"], agent_ops_overview: ["p_tenant", "p_entity", "p_hours"],
  agent_edges: ["p_tenant", "p_entity", "p_hours"], edge_failures: ["p_tenant", "p_entity", "p_agent_kind", "p_tool", "p_hours"],
  add_customer_contact: ["p_tenant", "p_entity", "p_id", "p_customer", "p_name", "p_email", "p_role", "p_primary", "p_phone", "p_sms", "p_whatsapp", "p_consent"],
  archive_customer_contact: ["p_tenant", "p_entity", "p_id"],
  propose_collection_message: ["p_tenant", "p_entity", "p_id", "p_customer", "p_contact", "p_tone", "p_subject", "p_body", "p_invoices", "p_attach", "p_channel"],
  decide_collection_message: ["p_tenant", "p_entity", "p_id", "p_decision"],
  record_payment_promise: ["p_tenant", "p_entity", "p_id", "p_customer", "p_invoice", "p_amount", "p_date", "p_note"],
  resolve_payment_promise: ["p_tenant", "p_entity", "p_id", "p_status", "p_reason"],
  propose_credit_limit: ["p_tenant", "p_entity", "p_id", "p_customer", "p_limit", "p_reason"],
  decide_credit_limit: ["p_tenant", "p_entity", "p_id", "p_decision"],
  place_customer_hold: ["p_tenant", "p_entity", "p_id", "p_customer", "p_reason"],
  release_customer_hold: ["p_tenant", "p_entity", "p_id", "p_reason"],
  collections_worklist: ["p_tenant", "p_entity", "p_as_of"], customer_account: ["p_tenant", "p_entity", "p_customer", "p_as_of"],
  customer_statement: ["p_tenant", "p_entity", "p_customer", "p_as_of"],
  add_customer_remark: ["p_tenant", "p_entity", "p_id", "p_customer", "p_invoice", "p_reason", "p_channel", "p_note", "p_next", "p_promise_amount", "p_promise_date"],
  add_trade_licence: ["p_tenant", "p_entity", "p_id", "p_customer", "p_number", "p_authority", "p_expiry"],
  my_follow_ups: ["p_tenant", "p_entity", "p_as_of", "p_all"], daily_call_list: ["p_tenant", "p_entity", "p_as_of", "p_limit"],
  licence_alerts: ["p_tenant", "p_entity", "p_as_of", "p_days"], customer_remarks_list: ["p_tenant", "p_entity", "p_customer"],
  remarks_logged: ["p_tenant", "p_entity", "p_date"],
  set_customer_segments: ["p_tenant", "p_entity", "p_id", "p_rows"],
  outstanding_breakdown: ["p_tenant", "p_entity", "p_as_of", "p_dimension", "p_category", "p_region"], customer_segments: ["p_tenant", "p_entity"],
  propose_adjustment_note: ["p_tenant", "p_entity", "p_id", "p_kind", "p_customer", "p_invoice", "p_amount", "p_reason", "p_memo", "p_reference", "p_due"],
  decide_adjustment_note: ["p_tenant", "p_entity", "p_id", "p_version", "p_decision", "p_reference"],
  withdraw_adjustment_note: ["p_tenant", "p_entity", "p_id", "p_version", "p_reason"], post_adjustment_note: ["p_tenant", "p_entity", "p_id", "p_version"],
  adjustment_notes_list: ["p_tenant", "p_entity", "p_status"], short_payment_candidates: ["p_tenant", "p_entity", "p_tolerance"],
} as const;
// jsonb parameters are serialized once here; everything else binds as a scalar.
const jsonParameters = new Set(["p_payload", "p_detail", "p_trace", "p_params", "p_simulation", "p_rows"]);
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
    async claimMessages(limit: number, channels: string[] = ["email"]) {
      return transaction(pool, async connection => (await connection.query<{ value: ClaimedMessage[] }>("select o2c_private.claim_collection_messages($1,$2::text[]) as value", [limit, channels])).rows[0]?.value ?? []);
    },
    async completeMessage(id: string, attempt: number, ok: boolean, providerId: string | null, error: string | null) {
      return transaction(pool, async connection => (await connection.query<{ value: string }>("select o2c_private.complete_collection_message($1,$2,$3,$4,$5) as value", [id, attempt, ok, providerId, error])).rows[0]?.value);
    },
    async messageStatement(id: string) {
      return transaction(pool, async connection => (await connection.query<{ value: unknown }>("select o2c_private.message_statement($1) as value", [id])).rows[0]?.value ?? null);
    },
    async detectIncidents() {
      return transaction(pool, async connection => (await connection.query<{ value: number }>("select o2c_private.detect_all_agent_incidents() as value")).rows[0]?.value ?? 0);
    },
    async scheduleDue(asOf: string) {
      return transaction(pool, async connection => (await connection.query<{ value: string }>("select o2c_private.schedule_due_runs($1) as value", [asOf])).rows.map(row => row.value));
    },
  };
}
export interface ClaimedRun { id: string; tenant_id: string; entity_id: string; kind: AgentKind; as_of: string; trigger: "manual" | "schedule"; agent_user: string }
export interface ClaimedMessage { channel: "email" | "sms" | "whatsapp"; id: string; tenant_id: string; entity_id: string; customer_id: string; to: string; subject: string; body: string; attach_statement: boolean; attempts: number; customer: string; account: string }
export type AgentKind = "collections" | "cash_application" | "credit_risk" | "reporting";
