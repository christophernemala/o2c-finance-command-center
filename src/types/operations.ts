import type { AgentKind } from "./agents";

export interface OpsOverview {
  window_hours: number;
  runs: { finished: number; succeeded: number; running: number; median_seconds: number | null; p95_seconds: number | null };
  approvals: { pending: number; oldest_hours: number | null };
  auto_posted_today: string; cost_usd: string; cost_by_agent: Partial<Record<AgentKind, string>>;
  tools: { results: number; errors: number }; incidents: { open_critical: number; open_warning: number };
  health: null | {
    score: number;
    inputs: Record<"run_success" | "approval_age" | "incidents" | "tool_errors", number>;
    weights: Record<"run_success" | "approval_age" | "incidents" | "tool_errors", number>;
  };
}
export interface Edge { agent: AgentKind; tool: string; calls: number; ok: number; failed: number; p50_ms: number | null }
export interface EdgeFailure { run_id: string; seq: number; at: string; error: string | null; input: Record<string, unknown> | null }
export interface FieldCheck { name: string; expected: string; required: boolean; sent: string | null; status: "match" | "missing" | "invalid" }
export interface Incident {
  id: string; kind: "loop" | "tool_error_spike" | "stuck_run" | "model_stop" | "run_failed" | "guardrail_block"; severity: "critical" | "warning" | "info";
  agent_kind: string | null; run_id: string; tool: string | null; detail: Record<string, unknown>; cost_usd: string | null;
  opened_at: string; resolved_at: string | null; resolved_by: string | null;
}
export interface Simulation {
  days: number; calls_replayed: number; would_act_on: number; failures_caught: number; false_positives: number; total_failures: number;
  runs_affected: number; cost_of_affected_runs_usd: string;
}
export interface GuardrailRecord {
  id: string; name: string; kind: "deny_tool" | "max_amount" | "require_field" | "max_identical_calls"; agent_kind: AgentKind | null;
  params: Record<string, unknown>; created_by: string; created_at: string;
  versions: { version: number; stage: "monitor" | "warn" | "block" | "rolled_back"; status: "pending" | "active" | "rejected" | "superseded";
    simulation: Simulation | null; maker: string; checker: string | null; created_at: string; decided_at: string | null }[];
}
