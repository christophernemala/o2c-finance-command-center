import { twilioConfig } from "@/lib/messaging/twilio";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { access, entities, snapshot } from "@/lib/workspace";
import { postgresConfig } from "@/lib/postgres/config";
import { workspaces, type Workspace } from "@/types/workspace";
import type { AgentConsoleData } from "@/types/agents";
import { FinanceWorkspace } from "@/components/workspace";
import { AgentConsole } from "@/components/agent-console";
import { Copilot } from "@/components/copilot";
import { Reports } from "@/components/reports";
import { aiConfig } from "@/lib/ai/config";
import { validateArPack } from "@/lib/ar-pack";
import { GuardrailsView, IncidentsView, OperationsOverview } from "@/components/operations";
import { compareFields } from "@/lib/ai/context-compare";
import { CollectionsView } from "@/components/collections";
import { emailConfig } from "@/lib/email/resend";
import { breakdownDimensions, type Breakdown, type BreakdownDimension, type CallListRow, type CustomerAccount, type CustomerRemarks, type FollowUp, type LicenceAlert, type Segments, type WorklistRow } from "@/types/collections";
import { CustomersView } from "@/components/customers";
import { NotesView } from "@/components/notes";
import type { AdjustmentNote, ShortPayment } from "@/types/collections";
import { agentKinds, type AgentKind } from "@/types/agents";
import type { Edge, EdgeFailure, GuardrailRecord, Incident, OpsOverview, Simulation } from "@/types/operations";
export const dynamic = "force-dynamic";
const viewTitles: Record<Workspace, string> = {
  overview: "Overview", collections: "Collections", operations: "Agent operations", incidents: "Incidents", guardrails: "Guardrails", copilot: "Copilot", agents: "AI agents", customers: "Customers", notes: "Credit & debit notes", receivables: "Receivables",
  reconciliation: "Cash application", approvals: "Approvals", reports: "Reports", cashflow: "13-week cashflow",
  ecl: "ECL review", imports: "Import review", audit: "Audit explorer",
};
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = (await searchParams).view;
  return { title: workspaces.includes(view as Workspace) ? viewTitles[view as Workspace] : "Overview" };
}
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  if (!postgresConfig()) redirect("/login");
  const auth = await access(); if (!auth) redirect("/login");
  const params = await searchParams; const tenant = auth.memberships.find(row => row.tenant_id === params.tenant) ?? auth.memberships[0];
  if (!tenant) return <main id="main" className="mx-auto max-w-xl p-12"><h1 className="text-2xl font-semibold">Workspace access pending</h1><p className="my-6 text-muted">Your account is authenticated, but no tenant membership has been assigned. Ask your administrator to grant access.</p><form action="/api/auth" method="post"><input type="hidden" name="intent" value="logout"/><button className="button secondary">Sign out</button></form></main>;
  const options = await entities(tenant.tenant_id); const entity = options.find(row => row.id === params.entity) ?? options[0];
  if (!entity) return <main id="main" className="mx-auto max-w-xl p-12"><h1 className="text-2xl font-semibold">Legal entity setup pending</h1><p className="my-6 text-muted">An administrator needs to provision a legal entity for {tenant.tenant_name} before operational records can be imported.</p><form action="/api/auth" method="post"><input type="hidden" name="intent" value="logout"/><button className="button secondary">Sign out</button></form></main>;
  const requested = Number(params.page ?? 0); const page = Number.isSafeInteger(requested) && requested>=0 && requested<=100000 ? requested : 0;
  const view = workspaces.includes(params.view as Workspace) ? params.view as Workspace : "overview";
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  const data = await snapshot(tenant.tenant_id,entity.id,asOf,page);
  const scope = { p_tenant: tenant.tenant_id, p_entity: entity.id }; const aiReady = aiConfig() !== null;
  let analysis;
  if (view === "overview" || view === "reports") {
    const result = await auth.client.rpc("report_ar_pack", { ...scope, p_as_of: asOf });
    let pack = null;
    try { pack = result.error ? null : validateArPack(result.data); } catch { pack = null; } // KPIs then stay "Unavailable".
    if (pack && view === "overview") {
      data.totals.dso_days = pack.dso_countback_days;
      if (pack.cei_30d_percent !== null && /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(pack.cei_30d_percent)) data.totals.cei_percent = pack.cei_30d_percent;
    }
    if (pack && view === "reports") analysis = <Reports pack={pack} tenant={tenant.tenant_id} entity={entity.id}/>;
  }
  if (view === "agents") {
    const result = await auth.client.rpc("agent_console", scope);
    if (!result.error) analysis = <AgentConsole data={data} consoleData={result.data as AgentConsoleData} aiReady={aiReady} userId={auth.user.id}
      selectedRun={typeof params.run === "string" && uuid.test(params.run) ? params.run : undefined}/>;
  }
  if (view === "operations") {
    const [overview, edges, incidents] = await Promise.all([auth.client.rpc("agent_ops_overview", { ...scope, p_hours: 24 }), auth.client.rpc("agent_edges", { ...scope, p_hours: 24 }),
      auth.client.rpc("agent_incidents_list", { ...scope, p_status: "open" })]);
    const [agent, tool] = typeof params.edge === "string" ? params.edge.split(":") : [];
    const edge = agentKinds.includes(agent as AgentKind) && /^[a-z_]{1,60}$/.test(tool ?? "") ? { agent: agent as AgentKind, tool } : undefined;
    const failures = edge ? await auth.client.rpc("edge_failures", { ...scope, p_agent_kind: edge.agent, p_tool: edge.tool, p_hours: 24 }) : null;
    const failed = (failures && !failures.error ? failures.data : []) as EdgeFailure[];
    if (!overview.error && !edges.error && !incidents.error) analysis = <OperationsOverview data={data} overview={overview.data as OpsOverview} edges={edges.data as Edge[]}
      incidents={incidents.data as Incident[]} edge={edge} failures={failed} fields={edge && failed[0] ? compareFields(edge.tool, failed[0].input, failed[0].error) : []}/>;
  }
  if (view === "collections") {
    const allFollowUps = params.followups === "all";
    const [worklist, callList, followUps, licences] = await Promise.all([auth.client.rpc("collections_worklist", { ...scope, p_as_of: asOf }),
      auth.client.rpc("daily_call_list", { ...scope, p_as_of: asOf, p_limit: 15 }), auth.client.rpc("my_follow_ups", { ...scope, p_as_of: asOf, p_all: allFollowUps }),
      auth.client.rpc("licence_alerts", { ...scope, p_as_of: asOf, p_days: 30 })]);
    const rows = (worklist.error ? [] : worklist.data) as WorklistRow[];
    const customer = typeof params.customer === "string" && uuid.test(params.customer) ? params.customer : rows[0]?.customer_id;
    const [detail, remarks] = customer ? await Promise.all([auth.client.rpc("customer_account", { ...scope, p_customer: customer, p_as_of: asOf }),
      auth.client.rpc("customer_remarks_list", { ...scope, p_customer: customer })]) : [null, null];
    if (!worklist.error) analysis = <CollectionsView data={data} worklist={rows} account={detail && !detail.error ? detail.data as CustomerAccount : null} emailReady={emailConfig() !== null} smsReady={twilioConfig(process.env, "sms") !== null} whatsappReady={twilioConfig(process.env, "whatsapp") !== null} userId={auth.user.id}
      callList={callList.error ? [] : callList.data as CallListRow[]} followUps={followUps.error ? [] : followUps.data as FollowUp[]} allFollowUps={allFollowUps}
      licences={licences.error ? [] : licences.data as LicenceAlert[]} remarks={remarks && !remarks.error ? remarks.data as CustomerRemarks : null}/>;
  }
  if (view === "customers") {
    const dimension = breakdownDimensions.includes(params.dimension as BreakdownDimension) ? params.dimension as BreakdownDimension : "category";
    const segment = (key: string) => typeof params[key] === "string" && (params[key] as string).length <= 60 ? params[key] as string : null;
    const [breakdown, segments] = await Promise.all([auth.client.rpc("outstanding_breakdown", { ...scope, p_as_of: asOf, p_dimension: dimension, p_category: segment("category"), p_region: segment("region") }),
      auth.client.rpc("customer_segments", scope)]);
    if (!breakdown.error && !segments.error) analysis = <CustomersView data={data} breakdown={breakdown.data as Breakdown} segments={segments.data as Segments}/>;
  }
  if (view === "notes") {
    const [notes, short] = await Promise.all([auth.client.rpc("adjustment_notes_list", { ...scope, p_status: "all" }), auth.client.rpc("short_payment_candidates", { ...scope, p_tolerance: "50.00" })]);
    if (!notes.error && !short.error) analysis = <NotesView data={data} notes={notes.data as AdjustmentNote[]} shortPayments={short.data as ShortPayment[]} userId={auth.user.id}/>;
  }
  if (view === "incidents") {
    const incidents = await auth.client.rpc("agent_incidents_list", { ...scope, p_status: "all" });
    if (!incidents.error) analysis = <IncidentsView data={data} incidents={incidents.data as Incident[]}/>;
  }
  if (view === "guardrails") {
    const text = (key: string, fallback = "") => typeof params[key] === "string" ? (params[key] as string).slice(0, 120) : fallback;
    const draft = { name: text("name"), kind: text("kind", "max_amount"), agent_kind: text("agent_kind", "all"), tool: text("tool", "propose_receipt"), field: text("field"), limit: text("limit") };
    const rules = await auth.client.rpc("agent_guardrails_list", scope);
    let simulation: Simulation | null | "invalid" = null;
    if (typeof params.kind === "string") {
      const ruleParams = draft.kind === "deny_tool" ? { tool: draft.tool } : draft.kind === "max_amount" ? { tool: draft.tool, limit: draft.limit }
        : draft.kind === "require_field" ? { tool: draft.tool, field: draft.field } : { limit: draft.limit };
      const result = await auth.client.rpc("simulate_guardrail", { ...scope, p_kind: draft.kind, p_agent_kind: draft.agent_kind === "all" ? null : draft.agent_kind, p_params: ruleParams, p_days: 30 });
      simulation = result.error ? "invalid" : result.data as Simulation;
      if (!draft.name) draft.name = draft.kind === "max_amount" ? `Cap ${draft.tool} at AED ${draft.limit}` : draft.kind === "require_field" ? `${draft.tool} requires ${draft.field}`
        : draft.kind === "deny_tool" ? `Deny ${draft.tool}` : `At most ${draft.limit} identical calls`;
    }
    if (!rules.error) analysis = <GuardrailsView data={data} rules={rules.data as GuardrailRecord[]} userId={auth.user.id} draft={draft} simulation={simulation}/>;
  }
  if (view === "copilot") {
    const thread = typeof params.thread === "string" && uuid.test(params.thread) ? params.thread : randomUUID();
    const [history, threads] = await Promise.all([auth.client.rpc("copilot_history", { ...scope, p_thread: thread }), auth.client.rpc("copilot_threads_list", scope)]);
    const turns = history.error ? [] : (history.data as { role: "user" | "assistant"; content: string }[]).map(row => ({ role: row.role, content: row.content }));
    const list = threads.error ? [] : threads.data as { id: string; title: string; updated_at: string }[];
    const link = (id: string) => `/?${new URLSearchParams({ view: "copilot", tenant: tenant.tenant_id, entity: entity.id, thread: id })}`;
    analysis = <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Conversations" className="space-y-2"><a className="button w-full" href={link(randomUUID())}>New conversation</a>
        {list.map(row => <a key={row.id} href={link(row.id)} aria-current={row.id === thread ? "page" : undefined} className="block truncate rounded-xl border border-line bg-surface px-3 py-2 text-sm aria-[current=page]:border-primary aria-[current=page]:text-link">{row.title}</a>)}</nav>
      <Copilot key={thread} tenant={tenant.tenant_id} entity={entity.id} thread={thread} initial={turns} aiReady={aiReady}/></div>;
  }
  return <FinanceWorkspace key={`${tenant.tenant_id}/${entity.id}`} memberships={auth.memberships} entityOptions={options} data={data} view={view} userId={auth.user.id} email={auth.user.email ?? "Authenticated user"} message={typeof params.message === "string" ? params.message : undefined} analysis={analysis}/>;
}
