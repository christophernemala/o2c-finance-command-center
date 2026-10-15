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
export const dynamic = "force-dynamic";
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
