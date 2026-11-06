"use client";
import { useEffect, useState } from "react";
import type { AgentStep } from "@/types/agents";
import { StepView } from "./step-view";
/** Live view of one run: replays recorded steps, then follows new ones until the run finishes. */
export function RunStream({ runId, tenant, entity }: { runId: string; tenant: string; entity: string }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [status, setStatus] = useState<{ status: string; summary?: string | null; error?: string | null; cost_usd?: string | null } | null>(null);
  const [connection, setConnection] = useState<"live" | "closed" | "error">("live");
  useEffect(() => {
    const source = new EventSource(`/api/agents/runs/${runId}?${new URLSearchParams({ tenant, entity })}`);
    source.addEventListener("step", event => { const step = JSON.parse((event as MessageEvent).data) as AgentStep; setSteps(current => current.some(row => row.seq === step.seq) ? current : [...current, step]); });
    source.addEventListener("status", event => setStatus(JSON.parse((event as MessageEvent).data)));
    source.addEventListener("error", () => { setConnection(current => current === "live" ? "closed" : current); source.close(); });
    return () => source.close();
  }, [runId, tenant, entity]);
  const running = status === null || ["queued", "running"].includes(status.status);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 font-medium">{running && connection === "live" && <span className="pulse-dot" aria-hidden="true"/>}{status ? status.status.replaceAll("_", " ") : "Connecting to run…"}</span>
      <span className="text-xs text-muted">{steps.length} recorded steps{status?.cost_usd ? ` · USD ${status.cost_usd} model cost` : ""}</span>
    </div>
    <ol className="space-y-2">{steps.map(step => <StepView key={step.seq} step={step}/>)}</ol>
    {!running && status?.summary && <div className="rounded-xl border border-line bg-surface p-4 text-sm leading-6 whitespace-pre-wrap"><p className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-muted">Agent summary</p>{status.summary}</div>}
    {!running && status?.error && <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{status.error}</p>}
    {connection === "closed" && running && <p className="text-xs text-muted">Live updates paused. Refresh to load the recorded state.</p>}
  </div>;
}
