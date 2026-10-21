import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiLimit } from "@/lib/api-limiter";
import { access } from "@/lib/workspace";
import { sameOrigin, boundedFormRequest } from "@/lib/request-security";
import { executeRun } from "@/lib/ai/runner";
import { aiDependencies } from "@/lib/ai/server";
import { dubaiDate } from "@/lib/ai/config";
export const maxDuration = 300;
const kind = z.enum(["collections", "cash_application", "credit_risk", "reporting"]);
const decimal = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/);
const input = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("run"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), kind }),
  z.object({ intent: z.literal("schedule"), tenant: z.uuid(), entity: z.uuid(), kind, cadence: z.enum(["manual", "daily"]) }),
  z.object({ intent: z.literal("policy_propose"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), auto: z.enum(["on", "off"]), item_limit: decimal, daily_limit: decimal }),
  z.object({ intent: z.literal("policy_decide"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), decision: z.enum(["active", "rejected"]) }),
  z.object({ intent: z.literal("guardrail_create"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), name: z.string().trim().min(3).max(120),
    kind: z.enum(["deny_tool", "max_amount", "require_field", "max_identical_calls"]), agent_kind: z.union([kind, z.literal("all")]),
    tool: z.string().max(60).optional(), field: z.string().max(40).optional(), limit: z.string().max(20).optional() }),
  z.object({ intent: z.literal("guardrail_stage"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), version: z.coerce.number().int().min(2).max(1000),
    stage: z.enum(["monitor", "warn", "block", "rolled_back"]) }),
  z.object({ intent: z.literal("guardrail_decide"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid(), version: z.coerce.number().int().min(2).max(1000),
    decision: z.enum(["active", "rejected"]) }),
  z.object({ intent: z.literal("incident_resolve"), tenant: z.uuid(), entity: z.uuid(), id: z.uuid() }),
]);
type GuardrailInput = { kind: string; tool?: string; field?: string; limit?: string };
/** Only the parameters each rule kind uses; PostgreSQL validates them again. */
function guardrailParams(input: GuardrailInput) {
  if (input.kind === "deny_tool") return { tool: input.tool };
  if (input.kind === "max_amount") return { tool: input.tool, limit: input.limit };
  if (input.kind === "require_field") return { tool: input.tool, field: input.field };
  return { limit: input.limit };
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers)) return new NextResponse("Forbidden", { status: 403 });
  const body = await boundedFormRequest(request, 4096);
  if (body instanceof Response) return body;
  const destination = new URL("/", request.headers.get("origin")!); destination.searchParams.set("view", "agents");
  try {
    const auth = await access(); if (!auth) return NextResponse.redirect(new URL("/login", destination), 303);
    const parsed = input.safeParse(Object.fromEntries(await body.formData()));
    if (!parsed.success) throw new Error("Invalid request");
    const data = parsed.data;
    destination.searchParams.set("tenant", data.tenant); destination.searchParams.set("entity", data.entity);
    const limited = await apiLimit(auth.user.id, "agents"); if (limited) return limited;
    const scope = { p_tenant: data.tenant, p_entity: data.entity };
    let result;
    if (data.intent === "run") {
      result = await auth.client.rpc("request_agent_run", { ...scope, p_id: data.id, p_kind: data.kind, p_as_of: dubaiDate() });
      if (!result.error) {
        const runId = data.id;
        // The response returns immediately; the run continues after it and streams steps from PostgreSQL.
        after(async () => { await executeRun(runId, aiDependencies()).catch(() => {}); });
        destination.searchParams.set("run", runId);
      }
    } else if (data.intent === "schedule") result = await auth.client.rpc("set_agent_schedule", { ...scope, p_kind: data.kind, p_cadence: data.cadence });
    else if (data.intent === "policy_propose") result = await auth.client.rpc("propose_agent_policy", { ...scope, p_id: data.id, p_auto: data.auto === "on", p_item_limit: data.item_limit, p_daily_limit: data.daily_limit });
    else if (data.intent === "policy_decide") result = await auth.client.rpc("decide_agent_policy", { ...scope, p_id: data.id, p_decision: data.decision });
    else if (data.intent === "guardrail_create") {
      destination.searchParams.set("view", "guardrails");
      const params = guardrailParams(data); const agentKind = data.agent_kind === "all" ? null : data.agent_kind;
      // The 30-day replay is stored with the rule so the checker later sees what the maker saw.
      const simulation = await auth.client.rpc("simulate_guardrail", { ...scope, p_kind: data.kind, p_agent_kind: agentKind, p_params: params, p_days: 30 });
      result = simulation.error ? simulation : await auth.client.rpc("propose_guardrail", { ...scope, p_id: data.id, p_name: data.name, p_kind: data.kind, p_agent_kind: agentKind, p_params: params, p_simulation: simulation.data });
    } else if (data.intent === "guardrail_stage") {
      destination.searchParams.set("view", "guardrails");
      const rules = await auth.client.rpc("agent_guardrails_list", scope);
      const rule = (rules.data as { id: string; kind: string; agent_kind: string | null; params: Record<string, unknown> }[] | null)?.find(entry => entry.id === data.id);
      const simulation = rule ? await auth.client.rpc("simulate_guardrail", { ...scope, p_kind: rule.kind, p_agent_kind: rule.agent_kind, p_params: rule.params, p_days: 30 }) : null;
      result = !rule || !simulation || simulation.error ? { data: null, error: { message: "Guardrail unavailable" } }
        : await auth.client.rpc("propose_guardrail_stage", { ...scope, p_id: data.id, p_version: data.version, p_stage: data.stage, p_simulation: simulation.data });
    } else if (data.intent === "guardrail_decide") {
      destination.searchParams.set("view", "guardrails");
      result = await auth.client.rpc("decide_guardrail_stage", { ...scope, p_id: data.id, p_version: data.version, p_decision: data.decision });
    } else {
      destination.searchParams.set("view", "incidents");
      result = await auth.client.rpc("resolve_agent_incident", { ...scope, p_id: data.id });
    }
    destination.searchParams.set("message", result.error ? (/Forbidden|Independent/.test(result.error.message) ? "forbidden" : "failed") : "confirmed");
  } catch { destination.searchParams.set("message", "failed"); }
  destination.searchParams.set("nonce", randomUUID().slice(0, 8));
  return NextResponse.redirect(destination, { status: 303, headers: { "Cache-Control": "no-store" } });
}
