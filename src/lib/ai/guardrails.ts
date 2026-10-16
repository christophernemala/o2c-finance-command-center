import { createHash } from "node:crypto";
import { amountExceeds } from "../money";

export type GuardrailStage = "monitor" | "warn" | "block";
export type GuardrailKind = "deny_tool" | "max_amount" | "require_field" | "max_identical_calls";
export interface Guardrail { id: string; name: string; kind: GuardrailKind; params: Record<string, unknown>; stage: GuardrailStage; version: number }
export interface GuardrailHit { rule: Guardrail; reason: string; action: "observed" | "warned" | "blocked" }
/** Structured result the agent receives when a block-stage rule stops a call. */
export interface GuardrailBlock { blocked_by: string; rule_id: string; stage: "block"; reason: string }

/** Rules run in this fixed order so the first block reason is deterministic. */
const ORDER: GuardrailKind[] = ["deny_tool", "max_amount", "require_field", "max_identical_calls"];
const ACTION = { monitor: "observed", warn: "warned", block: "blocked" } as const;

/** JSON with object keys sorted at every level, so equal inputs hash equally whatever their key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
export const inputHash = (tool: string, input: unknown) => createHash("sha256").update(`${tool}\n${canonicalJson(input)}`).digest("hex");

export function parseGuardrails(value: unknown): Guardrail[] {
  if (!Array.isArray(value)) throw new Error("Guardrails unavailable");
  return value.map(entry => {
    const rule = entry as Guardrail;
    if (typeof rule.id !== "string" || !ORDER.includes(rule.kind) || !(rule.stage in ACTION) || !rule.params || typeof rule.params !== "object") throw new Error("Guardrails unavailable");
    return rule;
  });
}

function violation(rule: Guardrail, tool: string, input: Record<string, unknown>, identicalCount: number): string | null {
  const target = rule.params.tool;
  if (rule.kind === "deny_tool") return target === tool ? `${tool} is not allowed for this agent` : null;
  if (rule.kind === "max_amount") {
    if (target !== tool || typeof input.amount !== "string" || typeof rule.params.limit !== "string") return null;
    try { return amountExceeds(input.amount, rule.params.limit) ? `Amount AED ${input.amount} exceeds the AED ${rule.params.limit} limit` : null; } catch { return null; }
  }
  if (rule.kind === "require_field") {
    const field = String(rule.params.field); const value = input[field];
    return target === tool && (value === undefined || value === null || value === "") ? `${tool} requires ${field}` : null;
  }
  const limit = Number(rule.params.limit);
  return Number.isInteger(limit) && identicalCount > limit ? `Identical ${tool} call repeated ${identicalCount} times in this run (limit ${limit})` : null;
}

/** Evaluate every active rule against one tool call. identicalCount includes this call. */
export function evaluateGuardrails(rules: Guardrail[], tool: string, input: unknown, identicalCount: number): GuardrailHit[] {
  const fields = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return [...rules].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).flatMap(rule => {
    const reason = violation(rule, tool, fields, identicalCount);
    return reason ? [{ rule, reason, action: ACTION[rule.stage] }] : [];
  });
}
export function blockFor(hits: GuardrailHit[]): GuardrailBlock | null {
  const hit = hits.find(entry => entry.action === "blocked");
  return hit ? { blocked_by: hit.rule.name, rule_id: hit.rule.id, stage: "block", reason: hit.reason } : null;
}
