import { agentControl, financeClient, type ClaimedRun } from "../postgres/client";
import type { SqlPool } from "../postgres/transaction";
import { newToken, tokenHash } from "../auth/crypto";
import type { AiConfig } from "./config";
import { agentDefinitions, agentKickoff, agentSystemPrompt } from "./agents";
import { runLoop, serializeResult, type ModelCaller } from "./loop";
import { usageCost } from "./pricing";
import { tools, type ToolContext } from "./tools";

const preview = (value: unknown, limit = 6000) => { const json = serializeResult(value); return json.length > limit ? `${json.slice(0, limit)}…` : json; };

/**
 * Execute one queued agent run end to end. The run is claimed atomically; a second caller gets null.
 * The agent acts through a short-lived session for the tenant's agent identity, so PostgreSQL applies
 * the agent role (read + propose + policy auto-post) to every tool call.
 */
export async function executeRun(runId: string, deps: { pool: SqlPool; config: AiConfig | null; call: ModelCaller | null }): Promise<ClaimedRun | null> {
  const token = newToken();
  const run = await agentControl(deps.pool).claim(runId, tokenHash(token));
  if (!run) return null;
  const client = financeClient(deps.pool, () => token);
  const scope = { p_tenant: run.tenant_id, p_entity: run.entity_id, p_run: run.id };
  const step = async (type: string, tool: string | null, detail: Record<string, unknown>, duration: number | null = null) => {
    const result = await client.rpc("agent_record_step", { ...scope, p_type: type, p_tool: tool, p_detail: detail, p_duration: duration });
    if (result.error) throw new Error(`Step not recorded: ${result.error.message}`);
  };
  const finish = (status: "succeeded" | "failed", summary: string, extra: { model?: string; input?: number; output?: number; cacheRead?: number; cost?: string | null; error?: string } = {}) =>
    client.rpc("agent_finish_run", { ...scope, p_status: status, p_summary: summary || null, p_model: extra.model ?? null, p_input_tokens: extra.input ?? 0,
      p_output_tokens: extra.output ?? 0, p_cache_read_tokens: extra.cacheRead ?? 0, p_cost: extra.cost ?? null, p_error: extra.error ?? null });
  const definition = agentDefinitions[run.kind];
  if (!deps.config || !deps.call) {
    await step("error", null, { message: "AI provider not configured. Set ANTHROPIC_API_KEY on the server." }).catch(() => {});
    await finish("failed", "", { error: "AI provider not configured" });
    return run;
  }
  const context: ToolContext = { client, tenant: run.tenant_id, entity: run.entity_id, asOf: run.as_of, actor: "agent", runId: run.id, findings: [],
    record: (type, detail) => step(type, null, detail) };
  try {
    const result = await runLoop({
      call: deps.call, model: deps.config.model, effort: deps.config.agentEffort, maxTurns: definition.maxTurns,
      system: agentSystemPrompt(definition), tools: tools.filter(entry => definition.tools.includes(entry.name)), context,
      messages: [{ role: "user", content: agentKickoff({ asOf: run.as_of, entity: run.entity_id, trigger: run.trigger }) }],
      onEvent: async event => {
        if (event.type === "thinking") await step("thinking", null, { text: event.text.slice(0, 8000) });
        else if (event.type === "message") await step("message", null, { text: event.text.slice(0, 20000) });
        else if (event.type === "tool_call") await step("tool_call", event.tool, { input: event.input });
        else await step("tool_result", event.tool, { ok: event.ok, output: preview(event.output) }, event.duration_ms);
      },
    });
    const cost = usageCost(result.model, result.usage);
    const totals = { model: result.model, input: result.usage.input + result.usage.cacheRead + result.usage.cacheWrite, output: result.usage.output, cacheRead: result.usage.cacheRead, cost };
    if (result.status === "failed") await step("error", null, { message: result.error ?? "Run failed" });
    await finish(result.status, result.text, { ...totals, error: result.error });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Agent run failed";
    await step("error", null, { message }).catch(() => {});
    await finish("failed", "", { error: message }).catch(() => {});
  }
  return run;
}
