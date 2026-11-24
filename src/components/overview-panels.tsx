import Link from "next/link";
import Decimal from "decimal.js";
import { ArrowRight, BarChart3, ClipboardCheck, Phone, ShieldCheck } from "lucide-react";
import { chartRatio } from "@/lib/cashflow";
import type { Snapshot, Workspace, MetricChart } from "@/types/workspace";
import { Empty, Money, Panel } from "./ui";

type OverviewPanelsProps = { data: Snapshot; href: (target: Workspace) => string };

export function OverviewPanels({ data, href }: OverviewPanelsProps) {
  const aging = data.insights.charts.find(chart => chart.key === "aging" && chart.unit === "AED");
  return <section className="overview-support-grid" aria-label="Aging, recovery workflow, and integration readiness">
    <div className="overview-primary-stack">
      <AgingBuckets chart={aging} asOf={data.as_of} fetchedAt={data.fetched_at}/>
      <RevenueProtection data={data} href={href}/>
    </div>
    <div className="overview-secondary-stack">
      <PowerBiReadiness href={href}/>
      <VoiceReadiness/>
      <ActionPriorities data={data} href={href}/>
    </div>
  </section>;
}

function AgingBuckets({ chart, asOf, fetchedAt }: { chart?: MetricChart; asOf: string; fetchedAt: string }) {
  if (!chart || chart.unit !== "AED") return <Panel title="Receivables aging" subtitle="Source-backed open balances by due-date band."><div className="p-5"><Empty title="Aging totals are unavailable">No verified aging series was returned for this snapshot. No invoice-page data is substituted.</Empty></div></Panel>;
  const maximum = chart.series.reduce((current, row) => {
    const value = new Decimal(row.value);
    return value.gt(current) ? value : current;
  }, new Decimal(0)).toFixed(2);
  return <Panel title="Receivables aging" subtitle="All posted open invoices · current balances re-aged at the reporting date." action={<span className="data-scope"><BarChart3 size={13}/>AED</span>}>
    {chart.series.length ? <div className="aging-overview-list" aria-label="Selected-entity aging buckets">
      {chart.series.map((row, index) => <div className="aging-overview-row" key={row.label}>
        <div className="aging-overview-label"><span>{row.label}</span><strong className="money"><Money value={row.value}/></strong></div>
        <div className="aging-overview-track" aria-hidden="true"><span style={{ width: `${chartRatio(row.value, maximum) * 100}%`, background: `var(--chart-${index % 6 + 1})` }}/></div>
      </div>)}
      <p className="aging-overview-source">{chart.description} As of {asOf} · retrieved {new Date(fetchedAt).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })} GST. Current snapshot, not a live stream.</p>
    </div> : <div className="p-5"><Empty title="No aging values in this snapshot">The source returned no aging buckets for this entity and date.</Empty></div>}
  </Panel>;
}

function RevenueProtection({ data, href }: OverviewPanelsProps) {
  const steps = [
    { title: "Review overdue accounts", description: "Prioritize the recorded overdue balance and current age.", target: "collections" as const },
    { title: "Check account evidence", description: "Verify invoice, dispute, contact consent, and promise status.", target: "collections" as const },
    { title: "Propose a follow-up", description: "Customer messages remain pending until an independent approver reviews them.", target: "collections" as const },
    { title: "Reconcile received cash", description: "Only approved and posted receipts change invoice settlement.", target: "reconciliation" as const },
  ];
  return <Panel title="Revenue protection workflow" subtitle="A source-led path from overdue review to confirmed cash.">
    <div className="p-5">
      <div className="recovery-overdue"><span>Recorded overdue AR · {data.as_of}</span><strong className="money"><Money value={data.totals.overdue}/></strong></div>
      <ol className="recovery-steps">{steps.map((step, index) => <li key={step.title}>
        <span className="recovery-step-number">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0"><Link href={href(step.target)} className="recovery-step-link">{step.title}<ArrowRight size={14}/></Link><p>{step.description}</p></div>
      </li>)}</ol>
      <p className="recovery-boundary">Recovered revenue is not estimated or attributed by this dashboard. Confirmed cash must appear in posted ledger records.</p>
    </div>
  </Panel>;
}

function Status({ children }: { children: string }) {
  return <span className="integration-status"><span aria-hidden="true"/> {children}</span>;
}

function PowerBiReadiness({ href }: { href: (target: Workspace) => string }) {
  return <Panel title="Power BI embedded analytics" subtitle="Service connection status" action={<Status>Not configured</Status>}>
    <div className="integration-card-body">
      <p>Power BI is not connected. The charts on this page are native O2C analytics with exact-value, matrix, and table views; no external report is embedded.</p>
      <details className="integration-requirements"><summary>Setup required for a future embed</summary>
        <ul><li>Microsoft Entra tenant/directory ID and application/client ID</li><li>Server-only client secret or certificate credentials</li><li>Power BI workspace ID, report ID, and semantic-model (dataset) ID for the chosen embed flow</li><li>Tenant/entity-scoped effective identity and tested RLS role mapping in the embed-token flow</li><li>Power BI admin enablement, service-principal workspace access, and production capacity</li></ul>
      </details>
      <Link href={href("reports")} className="button secondary integration-link">Open native AR reports<ArrowRight size={15}/></Link>
    </div>
  </Panel>;
}

function VoiceReadiness() {
  return <Panel title="Twilio Voice calling agent" subtitle="Outbound calling readiness" action={<Status>Not configured</Status>}>
    <div className="integration-card-body">
      <p>The configured Twilio code supports SMS and WhatsApp only. This app has no Voice call endpoint or status callback, so it cannot place or report a call.</p>
      <div className="voice-approval-gate"><ShieldCheck size={17}/><p><strong>Human approval is required before any future call.</strong> A future flow must recheck consent and invoice evidence, obtain independent approval, then show the exact recipient and purpose for explicit human confirmation immediately before dialing; provider outcomes must be recorded.</p></div>
      <details className="integration-requirements"><summary>Setup required for a future Voice flow</summary>
        <ul><li>Twilio Account SID, API key SID, and API key secret (server-only)</li><li>A Voice-capable Twilio From number or verified outbound caller ID</li><li>A consented E.164 To destination from the customer contact record for each reviewed call</li><li>TwiML instructions, a hosted Voice URL, or TwiML Application SID</li><li>Public HTTPS StatusCallback endpoint with request-signature validation</li></ul>
      </details>
      <button type="button" className="button secondary integration-link" disabled aria-describedby="voice-unavailable"><Phone size={15}/>Call unavailable</button>
      <p id="voice-unavailable" className="integration-disabled-note">No call action is enabled until the Voice integration and approval workflow are implemented and tested.</p>
    </div>
  </Panel>;
}

function ActionPriorities({ data, href }: OverviewPanelsProps) {
  return <Panel title="Action queue" subtitle="Recorded work in the selected entity.">
    <div className="action-priorities">
      <div><span>Pending approvals</span><strong className="tabular-nums">{data.totals.pending_count.toLocaleString("en")}</strong></div>
      <div><span>Invoice records</span><strong className="tabular-nums">{data.totals.invoice_count.toLocaleString("en")}</strong></div>
      <div><span>Unapplied cash</span><strong className="money"><Money value={data.totals.unapplied}/></strong></div>
      {data.totals.allowance === null ? <div><span>Approved ECL</span><strong>Unavailable</strong></div> : <div><span>Approved ECL</span><strong className="money"><Money value={data.totals.allowance}/></strong></div>}
      <Link href={href("approvals")} className="button integration-link"><ClipboardCheck size={15}/>Review approvals<ArrowRight size={14}/></Link>
    </div>
  </Panel>;
}
