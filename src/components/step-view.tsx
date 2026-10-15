import { AlertTriangle, Bot, Brain, CheckCircle2, FileText, Gavel, Wrench, XCircle } from "lucide-react";
import type { AgentStep } from "@/types/agents";
const labels: Record<string, string> = {
  get_ar_overview: "Read AR position", list_invoices: "Read invoices", get_cash_match_candidates: "Match bank credits", get_ar_kpi_pack: "Compute KPI pack",
  propose_receipt: "Propose receipt", propose_allocation: "Propose allocation", auto_post_if_policy_allows: "Policy auto-post check",
  record_finding: "Record finding", draft_collection_message: "Draft collections message", read_uploaded_file: "Read uploaded file",
};
const text = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2);
/** One persisted agent step. Server-renderable; also used inside the live stream. */
export function StepView({ step }: { step: AgentStep }) {
  const d = step.detail;
  if (step.type === "thinking") return <li className="step"><Brain size={16} className="text-muted" aria-hidden="true"/><details className="min-w-0 flex-1 text-sm text-muted"><summary>Reasoning summary</summary><p className="mt-2 whitespace-pre-wrap leading-6">{text(d.text)}</p></details></li>;
  if (step.type === "message") return <li className="step"><Bot size={16} className="text-link" aria-hidden="true"/><p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6">{text(d.text)}</p></li>;
  if (step.type === "tool_call") return <li className="step"><Wrench size={16} className="text-muted" aria-hidden="true"/><details className="min-w-0 flex-1 text-sm"><summary><span className="font-medium">{labels[step.tool ?? ""] ?? step.tool}</span> <code className="text-xs text-muted">{step.tool}</code></summary><pre className="mt-2 overflow-auto rounded-lg bg-surface-muted p-3 text-xs">{text(d.input)}</pre></details></li>;
  if (step.type === "tool_result") return <li className="step">{d.ok ? <CheckCircle2 size={16} className="text-success" aria-hidden="true"/> : <XCircle size={16} className="text-danger" aria-hidden="true"/>}<details className="min-w-0 flex-1 text-sm text-muted"><summary>{d.ok ? "Result" : "Tool error"} · {step.tool} · {step.duration_ms ?? 0} ms</summary><pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface-muted p-3 text-xs">{text(d.output)}</pre></details></li>;
  if (step.type === "finding") {
    const severity = String(d.severity ?? "info"); const draft = d.kind === "dunning_draft";
    return <li className={`step rounded-xl border p-3 ${severity === "critical" ? "border-danger/40 bg-danger-soft" : severity === "warning" ? "border-warning/40 bg-warning-soft" : "border-line bg-surface"}`}>
      {draft ? <FileText size={16} aria-hidden="true"/> : <AlertTriangle size={16} aria-hidden="true"/>}
      <div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{draft ? "Draft (not sent) · " : ""}{text(d.title)}</p>
        {draft ? <details className="mt-1"><summary className="text-xs">Show draft</summary><p className="mt-2 whitespace-pre-wrap leading-6">{text(d.detail)}</p></details> : <p className="mt-1 whitespace-pre-wrap leading-6">{text(d.detail)}</p>}</div></li>;
  }
  if (step.type === "proposal") return <li className="step rounded-xl border border-line bg-primary-soft p-3"><Gavel size={16} className="text-link" aria-hidden="true"/><div className="min-w-0 flex-1 text-sm"><p className="font-semibold">Proposed {text(d.kind)} · AED {text(d.amount)}</p><p className="mt-1 text-muted">{text(d.evidence)}</p><p className="mt-1 break-all text-xs text-muted">Approval {text(d.approval_id)} · awaiting independent approval</p></div></li>;
  if (step.type === "auto_execution") return <li className="step rounded-xl border border-line bg-surface p-3">{d.status === "posted" ? <CheckCircle2 size={16} className="text-success" aria-hidden="true"/> : <Gavel size={16} className="text-warning" aria-hidden="true"/>}<div className="min-w-0 flex-1 text-sm"><p className="font-semibold">{d.status === "posted" ? "Posted under approved policy" : "Left for human approval"}</p><p className="mt-1 text-muted">{d.status === "posted" ? `Journal ${text(d.journal_id)}` : text(d.reason)}</p></div></li>;
  return <li className="step rounded-xl bg-danger-soft p-3 text-danger"><XCircle size={16} aria-hidden="true"/><p className="text-sm">{text(d.message)}</p></li>;
}
