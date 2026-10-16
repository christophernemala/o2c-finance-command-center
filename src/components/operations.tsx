import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@/types/workspace";
import type { AgentKind } from "@/types/agents";
import type { Edge, EdgeFailure, FieldCheck, GuardrailRecord, Incident, OpsOverview, Simulation } from "@/types/operations";
import { Panel, Empty, Badge } from "./ui";
import { formatAed } from "@/lib/money";
import { MutationForm } from "./mutation-form";

const agentName: Record<AgentKind, string> = { cash_application: "Cash application", collections: "Collections", credit_risk: "Credit risk", reporting: "Reporting" };
const when = (value: string | null) => value ? new Date(value).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "—";
const seconds = (value: number | null) => value === null ? "—" : value >= 60 ? `${Math.floor(value / 60)}m ${Math.round(value % 60)}s` : `${value}s`;
const Scope = ({ data }: { data: Snapshot }) => <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/></>;
/** KPI amount: the currency code is set small so large figures fit the card at 36px. */
function KpiAmount({ value }: { value: string }) {
  const [code, ...rest] = formatAed(value).split(/\s+/);
  return <><span className="mr-1 font-sans text-sm font-medium tracking-normal text-muted">{code}</span><span className="whitespace-nowrap">{rest.join(" ")}</span></>;
}
function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rounded-xl border border-line bg-surface px-6 py-4"><p className="text-xs font-medium text-muted">{label}</p><p className="kpi-value mt-2">{value}</p>{note && <p className="mt-1 text-xs text-muted">{note}</p>}</div>;
}

export function OperationsOverview({ data, overview, edges, incidents, edge, failures, fields }: {
  data: Snapshot; overview: OpsOverview; edges: Edge[]; incidents: Incident[]; edge?: { agent: AgentKind; tool: string }; failures: EdgeFailure[]; fields: FieldCheck[];
}) {
  const href = (params: Record<string, string>) => `/?${new URLSearchParams({ view: "operations", tenant: data.tenant_id, entity: data.entity_id, ...params })}`;
  const runs = overview.runs; const health = overview.health;
  const costs = Object.entries(overview.cost_by_agent) as [AgentKind, string][];
  const maxCost = costs.reduce((max, [, cost]) => Math.max(max, Number(cost)), 0); // display scaling only; values stay strings
  return <div className="space-y-6">
    <section aria-label="Operations summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Run success" value={runs.finished ? `${runs.succeeded} / ${runs.finished}` : "—"} note={`Last ${overview.window_hours} hours · ${runs.running} running`}/>
      <Stat label="Median run time" value={seconds(runs.median_seconds)} note={runs.p95_seconds === null ? "No finished runs" : `p95 ${seconds(runs.p95_seconds)}`}/>
      <Stat label="Pending approvals" value={overview.approvals.pending} note={overview.approvals.oldest_hours === null ? "Inbox clear" : `Oldest ${overview.approvals.oldest_hours} hours`}/>
      <Stat label="Auto-posted today" value={<KpiAmount value={overview.auto_posted_today}/>} note="Policy postings, Asia/Dubai date"/>
    </section>
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Panel title="Health score" subtitle="Weighted mean of recorded signals for the window.">
        {health ? <div className="p-6"><p className="kpi-value">{health.score}<span className="ml-2 text-sm font-normal text-muted">of 100</span></p>
          <dl className="mt-4 divide-y divide-line text-sm">{([["Run success", "run_success"], ["Approval age", "approval_age"], ["Open incidents", "incidents"], ["Tool success", "tool_errors"]] as const).map(([label, key]) =>
            <div key={key} className="flex justify-between gap-4 py-2"><dt className="text-muted">{label} ({health.weights[key]}%)</dt><dd className="money">{health.inputs[key]}</dd></div>)}</dl>
          <p className="mt-4 text-xs leading-5 text-muted">Weights total 85. Email send success (15%) joins the formula when outbound collections ship.</p></div>
          : <Empty title="Not enough runs yet">The score appears after the first agent run in this window finishes. Nothing is estimated before then.</Empty>}
      </Panel>
      <Panel title="Agent handoffs" subtitle="Each line is an agent calling a tool. Width shows volume; red means at least one failure. Select a line to compare what was required with what was sent.">
        {edges.length ? <AgentMap edges={edges} href={(agent, tool) => href({ edge: `${agent}:${tool}` })} selected={edge}/> : <Empty title="No tool calls recorded">Run an agent from the AI agents workspace. Its tool calls appear here once recorded.</Empty>}
      </Panel>
    </div>
    {edge && <Panel title={`Context comparison · ${agentName[edge.agent]} → ${edge.tool}`} subtitle="Required fields from the tool's schema against the input of the most recent failed call.">
      {failures.length ? <div className="space-y-4 p-6">
        <div role="note" className="rounded-lg border-l-4 border-danger bg-danger-soft p-4 text-sm"><p className="font-medium">{failures.length} failed call{failures.length === 1 ? "" : "s"} in the window</p><p className="mt-1 break-words">{failures[0].error}</p></div>
        <div className="overflow-auto"><table><caption className="sr-only">Field comparison</caption><thead><tr><th scope="col">Field · expected</th><th scope="col">Sent</th><th scope="col">Status</th></tr></thead><tbody>
          {fields.map(field => <tr key={field.name}><td><span className="money text-sm">{field.name}</span><p className="text-xs text-muted">{field.expected}{field.required ? "" : " · optional"}</p></td>
            <td className="max-w-xs break-words text-sm">{field.sent ?? "—"}</td><td><Badge value={field.status === "match" ? "posted" : field.status === "missing" ? "failed" : "review"} label={field.status}/></td></tr>)}
        </tbody></table></div>
        <p className="text-sm"><Link className="text-link underline-offset-2 hover:underline" href={`/?${new URLSearchParams({ view: "agents", tenant: data.tenant_id, entity: data.entity_id, run: failures[0].run_id })}`}>Open the run trace</Link>
          {" · "}<Link className="text-link underline-offset-2 hover:underline" href={`/?${new URLSearchParams({ view: "guardrails", tenant: data.tenant_id, entity: data.entity_id, kind: "require_field", tool: edge.tool, agent_kind: edge.agent })}`}>Simulate a guardrail</Link></p>
      </div> : <Empty title="No failed calls on this handoff">All recorded calls on this line succeeded in the window.</Empty>}
    </Panel>}
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Open incidents" subtitle="Opened automatically by the detectors at the end of every run and by the scheduler.">
        {incidents.length ? <ul className="divide-y divide-line">{incidents.slice(0, 6).map(incident => <IncidentRow key={incident.id} incident={incident} data={data}/>)}</ul>
          : <Empty title="No open incidents">Loops, tool error spikes, stuck runs, failed runs and guardrail blocks open incidents here.</Empty>}
      </Panel>
      <Panel title="Model cost by agent" subtitle={`USD at list price, last ${overview.window_hours} hours. Total USD ${overview.cost_usd}.`}>
        {costs.length ? <ul className="space-y-3 p-6">{costs.map(([kind, cost]) => <li key={kind} className="grid grid-cols-[140px_minmax(0,1fr)_96px] items-center gap-3 text-sm">
          <span>{agentName[kind] ?? kind}</span><span className="h-2 rounded-full bg-surface-muted" aria-hidden="true"><span className="block h-2 rounded-full bg-primary" style={{ width: `${maxCost ? Math.max(2, Number(cost) / maxCost * 100) : 0}%` }}/></span>
          <span className="money text-right">{cost}</span></li>)}</ul> : <Empty title="No model cost recorded">Costs appear after agent runs finish.</Empty>}
      </Panel>
    </div>
  </div>;
}

function AgentMap({ edges, href, selected }: { edges: Edge[]; href: (agent: AgentKind, tool: string) => string; selected?: { agent: AgentKind; tool: string } }) {
  const agents = [...new Set(edges.map(edge => edge.agent))]; const tools = [...new Set(edges.map(edge => edge.tool))].sort();
  const rowA = 64, rowT = 44, top = 16, height = Math.max(agents.length * rowA, tools.length * rowT) + top * 2;
  const ay = (agent: AgentKind) => top + agents.indexOf(agent) * rowA + (height - top * 2 - agents.length * rowA) / 2 + 22;
  const ty = (tool: string) => top + tools.indexOf(tool) * rowT + (height - top * 2 - tools.length * rowT) / 2 + 18;
  const max = Math.max(...edges.map(edge => edge.calls));
  return <div className="overflow-x-auto p-4"><svg viewBox={`0 0 760 ${height}`} className="h-auto w-full min-w-[620px]" role="group" aria-label="Agent to tool handoffs">
    {edges.map((edge, index) => {
      const y1 = ay(edge.agent), y2 = ty(edge.tool);
      // Stack labels when several agents call the same tool, so they never overlap.
      const stack = edges.slice(0, index).filter(other => other.tool === edge.tool).length; const d = `M 200 ${y1} C 360 ${y1}, 400 ${y2}, 540 ${y2}`;
      const bad = edge.failed > 0; const active = selected?.agent === edge.agent && selected.tool === edge.tool;
      return <a key={`${edge.agent}:${edge.tool}`} href={href(edge.agent, edge.tool)} aria-label={`${agentName[edge.agent]} to ${edge.tool}: ${edge.calls} calls, ${edge.failed} failed, median ${edge.p50_ms ?? "—"} ms`}>
        <path d={d} fill="none" stroke={bad ? "var(--danger)" : "var(--muted)"} strokeOpacity={active ? 1 : bad ? 0.9 : 0.45} strokeWidth={1.5 + 4 * edge.calls / max}/>
        <path d={d} fill="none" stroke="transparent" strokeWidth={16}/>
        <text x={532} y={y2 - 7 - 12 * stack} textAnchor="end" className="money" fontSize="11" fill={bad ? "var(--danger)" : "var(--muted)"}>{edge.calls} · {Math.round(100 * edge.ok / edge.calls)}%</text>
      </a>;
    })}
    {agents.map(agent => <g key={agent} transform={`translate(16 ${ay(agent) - 22})`}><rect width="184" height="44" rx="8" fill="var(--surface)" stroke="var(--primary)" strokeWidth="1.5"/>
      <text x="12" y="27" fontSize="13" fill="var(--ink)">{agentName[agent] ?? agent}</text></g>)}
    {tools.map(tool => <g key={tool} transform={`translate(540 ${ty(tool) - 16})`}><rect width="204" height="32" rx="8" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5"/>
      <text x="10" y="20" fontSize="11" className="money" fill="var(--ink)">{tool}</text></g>)}
  </svg></div>;
}

function IncidentRow({ incident, data, resolve }: { incident: Incident; data: Snapshot; resolve?: boolean }) {
  const label: Record<Incident["kind"], string> = { loop: "Repeated identical tool call", tool_error_spike: "Tool error spike", stuck_run: "Run stopped making progress",
    model_stop: "Model stopped before finishing", run_failed: "Run failed", guardrail_block: "Guardrail blocked a call" };
  return <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
    <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-medium"><Badge value={incident.severity === "critical" ? "failed" : incident.severity === "warning" ? "review" : "info"} label={incident.severity}/>{label[incident.kind]}</p>
      <p className="mt-1 text-xs text-muted">{agentName[incident.agent_kind as AgentKind] ?? "Agent"}{incident.tool ? ` · ${incident.tool}` : ""} · opened {when(incident.opened_at)}{incident.cost_usd ? ` · run cost USD ${incident.cost_usd}` : ""}</p></div>
    <div className="flex gap-2"><Link className="button secondary" href={`/?${new URLSearchParams({ view: "agents", tenant: data.tenant_id, entity: data.entity_id, run: incident.run_id })}`}>Investigate</Link>
      {resolve && !incident.resolved_at && <MutationForm action="/api/agents"><Scope data={data}/><input type="hidden" name="intent" value="incident_resolve"/><input type="hidden" name="id" value={incident.id}/><button className="button secondary">Resolve</button></MutationForm>}</div>
  </li>;
}

export function IncidentsView({ data, incidents }: { data: Snapshot; incidents: Incident[] }) {
  const open = incidents.filter(incident => !incident.resolved_at); const canResolve = ["approver", "admin"].includes(data.role);
  return <div className="space-y-6">
    <section aria-label="Incident summary" className="grid gap-4 sm:grid-cols-3">
      <Stat label="Open" value={open.length}/><Stat label="Critical" value={open.filter(incident => incident.severity === "critical").length}/>
      <Stat label="Resolved" value={incidents.length - open.length} note="Latest 200 incidents"/>
    </section>
    <Panel title="Incidents" subtitle={canResolve ? "Investigate opens the run trace. Approvers and admins resolve incidents." : "Investigate opens the run trace. Approvers and admins resolve incidents."}>
      {incidents.length ? <ul className="divide-y divide-line">{incidents.map(incident => <IncidentRow key={incident.id} incident={incident} data={data} resolve={canResolve}/>)}</ul>
        : <Empty title="No incidents recorded">Detectors run at the end of every agent run and on the daily schedule.</Empty>}
    </Panel>
  </div>;
}

const stageLabel = { monitor: "Monitor", warn: "Warn", block: "Block", rolled_back: "Rolled back" } as const;
const ruleText = (rule: { kind: string; params: Record<string, unknown> }) => rule.kind === "deny_tool" ? `Deny ${rule.params.tool}`
  : rule.kind === "max_amount" ? `${rule.params.tool} above ${typeof rule.params.limit === "string" ? formatAed(rule.params.limit) : "limit"}` : rule.kind === "require_field" ? `${rule.params.tool} requires ${rule.params.field}`
  : `More than ${rule.params.limit} identical calls per run`;

export function GuardrailsView({ data, rules, userId, draft, simulation }: {
  data: Snapshot; rules: GuardrailRecord[]; userId: string; draft: { name: string; kind: string; agent_kind: string; tool: string; field: string; limit: string }; simulation: Simulation | null | "invalid";
}) {
  const canPropose = ["maker", "approver", "admin"].includes(data.role); const checker = ["approver", "admin"].includes(data.role);
  const toolOptions = ["get_ar_overview", "list_invoices", "get_cash_match_candidates", "get_ar_kpi_pack", "propose_receipt", "propose_allocation", "auto_post_if_policy_allows", "record_finding", "draft_collection_message"];
  return <div className="space-y-6">
    {canPropose && <Panel title="Simulate a fix" subtitle="1 · Define a rule. 2 · Replay it over the last 30 days of recorded tool calls (no model calls). 3 · Create it in Monitor; Warn and Block need an independent approver.">
      <div className="grid gap-6 p-6 xl:grid-cols-2">
        <form action="/" method="get" className="space-y-4"><input type="hidden" name="view" value="guardrails"/><Scope data={data}/>
          <label>Rule<select name="kind" defaultValue={draft.kind}><option value="max_amount">Block a proposal above an AED amount</option><option value="require_field">Require a field on a tool call</option>
            <option value="max_identical_calls">Limit identical calls per run</option><option value="deny_tool">Deny a tool</option></select></label>
          <label>Applies to<select name="agent_kind" defaultValue={draft.agent_kind}><option value="all">All agents</option>{(Object.keys(agentName) as AgentKind[]).map(kind => <option key={kind} value={kind}>{agentName[kind]} agent</option>)}</select></label>
          <label>Tool (not used by identical-call limits)<select name="tool" defaultValue={draft.tool}>{toolOptions.map(tool => <option key={tool}>{tool}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label>Field (required-field rules)<input name="field" defaultValue={draft.field} pattern="[a-z_]{1,40}" placeholder="customer_id"/></label>
            <label>Limit (AED amount or call count)<input name="limit" defaultValue={draft.limit} inputMode="decimal" placeholder="5000.00"/></label></div>
          <p className="text-xs text-muted">Rules run in a fixed order: deny tool, amount limits, required fields, identical-call limits. Release of a credit hold is never an agent tool.</p>
          <button className="button">Simulate on last 30 days</button></form>
        <div>{simulation === "invalid" ? <div role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger">These parameters are not a valid rule. Check the tool, field and limit.</div>
          : simulation ? <div className="space-y-4"><dl className="grid grid-cols-2 gap-3 text-sm">{([["Calls replayed", simulation.calls_replayed], ["Would act on", simulation.would_act_on],
              ["Failures caught", `${simulation.failures_caught} of ${simulation.total_failures}`], ["False positives", simulation.false_positives],
              ["Runs affected", simulation.runs_affected], ["Cost of affected runs", `USD ${simulation.cost_of_affected_runs_usd}`]] as const).map(([label, value]) =>
              <div key={label} className="rounded-lg border border-line p-3"><dt className="text-xs text-muted">{label}</dt><dd className="kpi-value mt-1 !text-2xl">{value}</dd></div>)}</dl>
            <MutationForm action="/api/agents"><Scope data={data}/><input type="hidden" name="intent" value="guardrail_create"/><input type="hidden" name="id" value={randomUUID()}/>
              {(["kind", "agent_kind", "tool", "field", "limit"] as const).map(key => <input key={key} type="hidden" name={key} value={draft[key]}/>)}
              <label>Name<input name="name" required minLength={3} maxLength={120} defaultValue={draft.name}/></label>
              <button className="button">Create in Monitor</button></MutationForm></div>
          : <Empty title="No simulation yet">Define a rule and simulate it. The result is stored with the rule so the approver sees the same evidence.</Empty>}</div>
      </div>
    </Panel>}
    <Panel title="Tracked guardrails" subtitle="Every stage change is a new version. Monitor records, Warn records and lets the call run, Block stops it. Rolled back disables the rule.">
      {rules.length ? <ul className="divide-y divide-line">{rules.map(rule => {
        const active = rule.versions.find(version => version.status === "active"); const pending = rule.versions.find(version => version.status === "pending");
        const next = rule.versions.length + 1;
        return <li key={rule.id} className="space-y-3 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{rule.name}</p>
            <p className="mt-1 text-sm text-muted">{ruleText(rule)} · {rule.agent_kind ? `${agentName[rule.agent_kind]} agent` : "All agents"}</p></div>
            <Badge value={active?.stage === "block" ? "failed" : active?.stage === "warn" ? "review" : "info"} label={active ? stageLabel[active.stage] : "Inactive"}/></div>
          <p className="text-xs text-muted">{rule.versions.map(version => `v${version.version} ${stageLabel[version.stage]} (${version.status})`).join(" → ")}</p>
          {pending && <div className="rounded-lg border border-line p-4 text-sm"><p className="font-medium">Pending: move to {stageLabel[pending.stage]}</p>
            {pending.simulation && <p className="mt-1 text-xs text-muted">Simulation at proposal: would act on {pending.simulation.would_act_on} of {pending.simulation.calls_replayed} calls, {pending.simulation.failures_caught} failures caught, {pending.simulation.false_positives} false positive{pending.simulation.false_positives === 1 ? "" : "s"}.</p>}
            {checker && pending.maker !== userId ? <div className="mt-3 flex gap-2">{(["active", "rejected"] as const).map(decision => <MutationForm key={decision} action="/api/agents"><Scope data={data}/>
              <input type="hidden" name="intent" value="guardrail_decide"/><input type="hidden" name="id" value={rule.id}/><input type="hidden" name="version" value={pending.version}/><input type="hidden" name="decision" value={decision}/>
              <button className={decision === "active" ? "button" : "button secondary"}>{decision === "active" ? "Approve" : "Reject"}</button></MutationForm>)}</div>
              : <p className="mt-2 text-xs text-muted">A different approver or admin must decide this change.</p>}</div>}
          {canPropose && !pending && <div className="flex flex-wrap gap-2">{(["warn", "block", "rolled_back"] as const).filter(stage => stage !== active?.stage).map(stage => <MutationForm key={stage} action="/api/agents"><Scope data={data}/>
            <input type="hidden" name="intent" value="guardrail_stage"/><input type="hidden" name="id" value={rule.id}/><input type="hidden" name="version" value={next}/><input type="hidden" name="stage" value={stage}/>
            <button className="button secondary">{stage === "rolled_back" ? "Roll back" : `Propose ${stageLabel[stage]}`}</button></MutationForm>)}</div>}
        </li>;
      })}</ul> : <Empty title="No guardrails yet">Simulate a rule above. New rules start in Monitor, which records hits without changing any outcome.</Empty>}
    </Panel>
  </div>;
}
