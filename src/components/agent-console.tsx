import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Bot, CalendarClock, FileBarChart, HandCoins, Landmark, ShieldAlert } from "lucide-react";
import type { Snapshot } from "@/types/workspace";
import { agentKinds, type AgentConsoleData, type AgentKind } from "@/types/agents";
import { Panel, Badge, Empty, Money } from "./ui";
import { MutationForm } from "./mutation-form";
import { RunStream } from "./run-stream";

const catalogue: Record<AgentKind, { name: string; icon: typeof Bot; does: string; autonomy: string }> = {
  cash_application: { name: "Cash application", icon: Landmark, does: "Matches bank credits to invoices, proposes receipts and allocations.", autonomy: "Auto-posts exact matches within the approved policy; everything else waits for a checker." },
  collections: { name: "Collections", icon: HandCoins, does: "Ranks overdue customers and drafts reminder, firm and final-notice messages.", autonomy: "Drafts only. Nothing is sent." },
  credit_risk: { name: "Credit risk", icon: ShieldAlert, does: "Screens concentration, severe aging and disputed exposure.", autonomy: "Recommends holds for human decision." },
  reporting: { name: "Reporting", icon: FileBarChart, does: "Writes the AR management report with countback DSO and CEI.", autonomy: "Read-only." },
};
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "—";

export function AgentConsole({ data, consoleData, aiReady, selectedRun, userId }: { data: Snapshot; consoleData: AgentConsoleData; aiReady: boolean; selectedRun?: string; userId: string }) {
  const canRun = ["maker", "approver", "admin"].includes(data.role); const admin = data.role === "admin"; const checker = ["approver", "admin"].includes(data.role);
  const scope = <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/></>;
  const active = consoleData.policies.find(policy => policy.status === "active");
  const pending = consoleData.policies.filter(policy => policy.status === "pending");
  const runHref = (id: string) => `/?${new URLSearchParams({ view: "agents", tenant: data.tenant_id, entity: data.entity_id, run: id })}`;
  const selected = consoleData.runs.find(run => run.id === selectedRun);
  return <div className="space-y-6">
    {!aiReady && <div role="status" className="rounded-xl border border-line bg-warning-soft p-5 text-sm text-warning"><p className="font-semibold">AI provider not configured</p><p className="mt-1">Set <code>ANTHROPIC_API_KEY</code> on the server to enable agents and the copilot. Runs requested now are recorded and fail with this reason; no results are simulated.</p></div>}
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">{agentKinds.map(kind => {
      const info = catalogue[kind]; const latest = consoleData.runs.find(run => run.kind === kind); const cadence = consoleData.schedules[kind] ?? "manual";
      return <article key={kind} className="flex flex-col rounded-[22px] border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-primary-soft p-3 text-link"><info.icon size={22} aria-hidden="true"/></span>{latest ? <Badge value={latest.status}/> : <Badge value="idle"/>}</div>
        <h3 className="mt-4 font-semibold">{info.name} agent</h3><p className="mt-1 text-sm text-muted">{info.does}</p>
        <p className="mt-3 text-xs leading-5 text-muted"><strong className="text-ink">Autonomy:</strong> {info.autonomy}</p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted"><CalendarClock size={14} aria-hidden="true"/>{cadence === "daily" ? "Runs daily at 08:00 GST" : "Manual runs only"}{latest && <> · last {when(latest.created_at)}</>}</p>
        <div className="mt-auto space-y-2 pt-5">
          {canRun && <MutationForm action="/api/agents">{scope}<input type="hidden" name="intent" value="run"/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={randomUUID()}/><button className="button w-full"><Bot size={16} aria-hidden="true"/>Run now</button></MutationForm>}
          {admin && <MutationForm action="/api/agents">{scope}<input type="hidden" name="intent" value="schedule"/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="cadence" value={cadence === "daily" ? "manual" : "daily"}/><button className="button secondary w-full">{cadence === "daily" ? "Switch to manual" : "Schedule daily"}</button></MutationForm>}
        </div>
      </article>;
    })}</div>

    {selectedRun && <Panel title={selected ? `${catalogue[selected.kind].name} agent · live run` : "Agent run"} subtitle="Every reasoning summary, tool call, proposal and posting decision is recorded in PostgreSQL as it happens.">
      <div className="p-6"><RunStream runId={selectedRun} tenant={data.tenant_id} entity={data.entity_id}/></div></Panel>}

    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Run history" subtitle="Latest 30 runs in this legal entity. Select a run to replay its steps.">
        {consoleData.runs.length ? <div className="overflow-auto"><table><caption className="sr-only">Agent runs</caption><thead><tr><th scope="col">Agent / started</th><th scope="col">Status</th><th scope="col">Outcome</th><th scope="col">Model cost</th></tr></thead><tbody>
          {consoleData.runs.map(run => <tr key={run.id}><td><Link className="font-medium text-link underline-offset-2 hover:underline" href={runHref(run.id)}>{catalogue[run.kind]?.name ?? run.name}</Link><p className="mt-1 text-xs text-muted">{when(run.created_at)} · {run.trigger === "schedule" ? "scheduled" : run.requested_by === userId ? "requested by you" : "manual"}</p></td>
            <td><Badge value={run.status}/></td><td className="text-sm">{run.proposals} proposals · {run.auto_posted} auto-posted<p className="mt-1 text-xs text-muted">{run.step_count} steps</p></td>
            <td className="money text-sm">{run.cost_usd ? `USD ${run.cost_usd}` : "—"}<p className="mt-1 text-xs text-muted">{run.input_tokens + run.output_tokens} tokens</p></td></tr>)}
        </tbody></table></div> : <Empty title="No agent runs yet">Run an agent above. It reads your imported records, records each step, and leaves every proposal for an independent approver unless the auto-execution policy below allows posting.</Empty>}
      </Panel>

      <Panel title="Auto-execution policy" subtitle="Lets the cash application agent post exact matches without a human checker, within AED limits. Off by default; an admin proposes and a different approver activates.">
        <div className="space-y-5 p-6 text-sm">
          {active ? <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-muted p-4"><dt className="text-muted">Status</dt><dd>{active.auto_execute ? <Badge value="active"/> : <Badge value="disabled"/>}</dd>
            <dt className="text-muted">Per item limit</dt><dd className="money text-right"><Money value={active.per_item_limit}/></dd>
            <dt className="text-muted">Daily limit</dt><dd className="money text-right"><Money value={active.daily_limit}/></dd>
            <dt className="text-muted">Auto-posted today</dt><dd className="money text-right"><Money value={consoleData.auto_posted_today}/></dd></dl>
            : <p className="rounded-xl bg-surface-muted p-4">No active policy. Every agent proposal waits for an independent approver.</p>}
          {pending.map(policy => <div key={policy.id} className="rounded-xl border border-line p-4"><p className="font-medium">Pending policy · {policy.auto_execute ? "auto-execute on" : "auto-execute off"}</p><p className="mt-1 text-muted">Per item <Money value={policy.per_item_limit}/> · daily <Money value={policy.daily_limit}/></p>
            {checker && policy.maker !== userId ? <div className="mt-3 flex gap-2"><MutationForm action="/api/agents">{scope}<input type="hidden" name="intent" value="policy_decide"/><input type="hidden" name="id" value={policy.id}/><input type="hidden" name="decision" value="active"/><button className="button">Activate</button></MutationForm>
              <MutationForm action="/api/agents">{scope}<input type="hidden" name="intent" value="policy_decide"/><input type="hidden" name="id" value={policy.id}/><input type="hidden" name="decision" value="rejected"/><button className="button secondary">Reject</button></MutationForm></div>
              : <p className="mt-2 text-xs text-muted">A different approver or admin must activate this policy.</p>}</div>)}
          {admin && <MutationForm action="/api/agents">{scope}<input type="hidden" name="intent" value="policy_propose"/><input type="hidden" name="id" value={randomUUID()}/>
            <label>Auto-execution<select name="auto" defaultValue="off"><option value="off">Off: every proposal needs a human checker</option><option value="on">On: exact matches within limits</option></select></label>
            <div className="grid gap-3 sm:grid-cols-2"><label>Per item limit (AED)<input name="item_limit" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?" placeholder="5000.00"/></label>
              <label>Daily limit (AED)<input name="daily_limit" required inputMode="decimal" pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?" placeholder="50000.00"/></label></div>
            <button className="button secondary">Propose policy</button></MutationForm>}
        </div>
      </Panel>
    </div>
  </div>;
}
