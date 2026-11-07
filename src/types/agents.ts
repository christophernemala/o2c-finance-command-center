export type AgentKind = "collections" | "cash_application" | "credit_risk" | "reporting";
export const agentKinds: AgentKind[] = ["cash_application", "collections", "credit_risk", "reporting"];
export interface AgentRun {
  id: string; kind: AgentKind; name: string; status: string; trigger: "manual" | "schedule"; requested_by: string | null; as_of: string;
  model: string | null; input_tokens: number; output_tokens: number; cost_usd: string | null; summary: string | null; error: string | null;
  step_count: number; created_at: string; started_at: string | null; finished_at: string | null; proposals: number; auto_posted: number;
}
export interface AgentPolicy { id: string; auto_execute: boolean; per_item_limit: string; daily_limit: string; status: "pending" | "active"; maker: string; checker: string | null; created_at: string; decided_at: string | null }
export interface AgentConsoleData { agent_user: string | null; schedules: Partial<Record<AgentKind, "manual" | "daily">>; policies: AgentPolicy[]; auto_posted_today: string; runs: AgentRun[] }
export interface AgentStep { seq: number; type: "thinking" | "message" | "tool_call" | "tool_result" | "finding" | "proposal" | "auto_execution" | "error" | "guardrail"; tool: string | null; detail: Record<string, unknown>; duration_ms: number | null; created_at: string }
