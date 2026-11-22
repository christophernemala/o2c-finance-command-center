import { notFound } from "next/navigation";
import { AgentConsole } from "@/components/agent-console";
import { Copilot } from "@/components/copilot";
import { FinanceWorkspace } from "@/components/workspace";
import { SYNTHETIC_AS_OF, syntheticEntities, syntheticMemberships, syntheticSnapshot, syntheticViewerId } from "@/lib/demo/synthetic";
import type { AgentConsoleData, AiSpendStatus } from "@/types/agents";
import { workspaces, type Workspace } from "@/types/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic data preview" };

const demoConsole: AgentConsoleData = {
  agent_user: null,
  schedules: { cash_application: "manual", collections: "manual", credit_risk: "manual", reporting: "manual" },
  policies: [], auto_posted_today: "0.00", runs: [],
};
const demoBudget: AiSpendStatus = {
  date: SYNTHETIC_AS_OF, daily_limit_usd: null, spent_usd: "0.00", reserved_usd: "0.00",
  remaining_usd: null, open_reservations: 0, configured: false, paused: true,
};

/** This route is intentionally unavailable in production. Its fixture is for local UI review only. */
export default async function SyntheticPreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const requested = params.view;
  const view = workspaces.includes(requested as Workspace) ? requested as Workspace : "overview";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
const analysis = view === "agents"
    ? <AgentConsole data={syntheticSnapshot} consoleData={demoConsole} aiReady={false} aiBudget={demoBudget} userId={syntheticViewerId}/>
    : view === "copilot"
      ? <Copilot tenant={syntheticSnapshot.tenant_id} entity={syntheticSnapshot.entity_id} entityName={syntheticEntities[0].name} thread="00000000-0000-4000-8000-000000000004" initial={[]} aiReady={false} canWrite={false} budget={demoBudget}/>
    : undefined;

  return <FinanceWorkspace memberships={syntheticMemberships} entityOptions={syntheticEntities} data={syntheticSnapshot}
    view={view} userId={syntheticViewerId} email="local-preview@example.invalid" analysis={analysis} previewMode query={query}/>;
}
