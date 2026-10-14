import { randomUUID } from "node:crypto";
import { BarChart3, Landmark, Mail } from "lucide-react";
import type { Snapshot } from "@/types/workspace";
import { Panel, Badge, Empty } from "./ui";
import { MutationForm } from "./mutation-form";
export interface AgentJob { id: string; agent: string; status: "queued" | "completed"; requested_by: string; as_of: string; result: Record<string, unknown> | null; created_at: string }
export function AgentAnalysis({ data, jobs, userId, more }: { data: Snapshot; jobs: AgentJob[]; userId: string; more: boolean }) {
  const canRun = data.role === "maker" || data.role === "admin";
  const scope = <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/></>;
  return <Panel title="Governed analysis queue" subtitle="Rule-based agents analyze source records. Recommendations require human review; analysis never posts a journal or sends a message.">
    <div className="grid gap-4 p-6 lg:grid-cols-3">{[
      { id: "ar", name: "Accounts receivable", icon: BarChart3, description: "Aging and source exposure" },
      { id: "collections", name: "Collections", icon: Mail, description: "Overdue follow-up drafts" },
      { id: "treasury", name: "Treasury", icon: Landmark, description: "Reconciliation candidates" },
    ].map(agent => {
      const recorded = jobs.filter(job => job.agent === agent.id);
      const latest = recorded.reduce<AgentJob | undefined>((current, job) => !current || job.created_at > current.created_at ? job : current, undefined);
      return <article key={agent.id} className="rounded-[22px] border border-line bg-canvas p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><span className="rounded-xl bg-primary-soft p-3 text-link"><agent.icon size={22} aria-hidden="true"/></span>{latest && <Badge value={latest.status}/>}</div>
        <h3 className="font-semibold">{agent.name}</h3><p className="mt-1 text-sm text-muted">{agent.description}</p>
        <p className="mt-5 text-sm font-medium">{latest ? `${recorded.length} recorded ${recorded.length === 1 ? "run" : "runs"} in this view` : "No recorded runs"}</p>
        {latest && <p className="mt-2 text-xs leading-5 text-muted">Latest request: <time dateTime={latest.created_at}>{new Date(latest.created_at).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })} GST</time></p>}
        <p className="mt-2 text-xs leading-5 text-muted">{latest ? "Status reflects the recorded analysis job. Human review is required before financial action." : "Recorded jobs appear here after an authorized scoped request."}</p>
      </article>;
    })}</div>
    {canRun && <div className="p-6"><MutationForm action="/api/agents">{scope}<input type="hidden" name="id" value={randomUUID()}/><label>Specialized agent<select name="agent"><option value="ar">Accounts receivable · aging and exposure</option><option value="collections">Collections · overdue follow-up drafts</option><option value="treasury">Treasury · reconciliation candidates</option></select></label><button className="button">Run scoped analysis</button></MutationForm></div>}
    {jobs.length ? <div className="divide-y divide-line">{jobs.map(job => <article key={job.id} className="space-y-3 p-6"><div className="flex justify-between gap-3"><h3 className="font-semibold">{job.agent.toUpperCase()} · {job.as_of}</h3><Badge value={job.status}/></div><p className="break-all text-xs text-muted">Job {job.id} · requested by {job.requested_by}</p>
      {job.result && <details><summary>Source analysis and review candidates</summary><pre className="mt-3 overflow-auto rounded bg-surface-muted p-4 text-xs">{JSON.stringify(job.result,null,2)}</pre></details>}
      {canRun && job.status === "queued" && job.requested_by === userId && <MutationForm action="/api/agents">{scope}<input type="hidden" name="id" value={job.id}/><input type="hidden" name="agent" value={job.agent}/><input type="hidden" name="as_of" value={job.as_of}/><button className="button secondary">Resume queued analysis</button></MutationForm>}
    </article>)}</div> : <Empty title="No governed analysis jobs">An authorized maker can run an analysis against imported source records. Missing DSO, credit limits and forecast sources stay unavailable.</Empty>}
    {more && <p className="p-6 text-sm text-muted">Showing the 50 most recent jobs. Earlier jobs remain in the database and audit history.</p>}
  </Panel>;
}
