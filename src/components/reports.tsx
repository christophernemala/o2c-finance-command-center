import Link from "next/link";
import { Download } from "lucide-react";
import type { ArPack } from "@/lib/ar-pack";
import { Panel, Money, Empty } from "./ui";
export function Reports({ pack, tenant, entity }: { pack: ArPack; tenant: string; entity: string }) {
  const kpis = [
    { label: "Open AR", value: <Money value={pack.open_ar}/> }, { label: "Overdue AR", value: <Money value={pack.overdue_ar}/> },
    { label: "DSO (countback)", value: pack.dso_countback_days === null ? "Insufficient history" : `${pack.dso_countback_days} days` },
    { label: "CEI (30 days)", value: pack.cei_30d_percent === null ? "Unavailable" : `${pack.cei_30d_percent}%` },
  ];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Calculated in PostgreSQL from posted invoices and allocations as of {pack.as_of}. The reporting agent can turn this pack into a written management summary.</p>
      <Link className="button" href={`/api/export?${new URLSearchParams({ tenant, entity, report: "pack" })}`}><Download size={16} aria-hidden="true"/>Download AR pack (.xlsx)</Link></div>
    <Panel title="Month-end close support workbook" subtitle="Source-backed aging and customer pivots, exact-decimal tie-outs, KPI basis and top-debtor concentration.">
      <form action="/api/export" method="get" className="flex flex-wrap items-end gap-3 p-5">
        <input type="hidden" name="tenant" value={tenant}/><input type="hidden" name="entity" value={entity}/><input type="hidden" name="report" value="month_end"/>
        <label className="text-xs">Closing month<input required type="month" name="period" defaultValue={pack.as_of.slice(0,7)}/></label>
        <button className="button"><Download size={16} aria-hidden="true"/>Download close workbook (.xlsx)</button>
      </form>
      <p className="px-5 pb-5 text-xs leading-5 text-muted">Analysis only: the workbook re-ages current ledger balances to the selected month-end date. It cannot reconstruct prior-period balances, does not post a GL close, and does not replace an ERP close. Summary sheets are pre-aggregated pivot-style analyses, not interactive native Excel PivotTable objects.</p>
    </Panel>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(item => <article key={item.label} className="rounded-2xl border border-line bg-surface p-6 shadow-xs"><p className="text-sm text-muted">{item.label}</p><p className="mt-4 text-2xl font-semibold tracking-tight">{item.value}</p></article>)}</div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Aging by days past due" subtitle="Open balance of posted invoices."><div className="overflow-auto"><table><thead><tr><th scope="col">Bucket</th><th scope="col" className="money">Open AED</th><th scope="col" className="money">Invoices</th></tr></thead><tbody>{pack.aging.map(row => <tr key={row.bucket}><td>{row.bucket}</td><td className="money"><Money value={row.amount}/></td><td className="money">{row.invoices}</td></tr>)}</tbody></table></div></Panel>
      <Panel title="Top debtors" subtitle="Largest open balances.">{pack.top_debtors.length ? <div className="overflow-auto"><table><thead><tr><th scope="col">Customer</th><th scope="col" className="money">Open AED</th><th scope="col" className="money">Overdue AED</th></tr></thead><tbody>{pack.top_debtors.map(row => <tr key={row.account}><td className="font-medium">{row.customer}<p className="text-xs text-muted">{row.account} · oldest due {row.oldest_due ?? "—"}</p></td><td className="money"><Money value={row.open}/></td><td className="money"><Money value={row.overdue ?? "0.00"}/></td></tr>)}</tbody></table></div> : <Empty title="No open balances">Import invoices to populate this report.</Empty>}</Panel>
    </div>
    <Panel title="KPI basis" subtitle="Inputs used, so finance can tie the figures back to the ledger."><dl className="grid gap-4 p-6 text-sm sm:grid-cols-2 xl:grid-cols-3">
      <div><dt className="text-muted">DSO method</dt><dd className="mt-1">{pack.dso_basis}</dd></div>
      <div><dt className="text-muted">CEI period</dt><dd className="mt-1">{pack.cei_basis.period_start} → {pack.cei_basis.period_end}</dd></div>
      <div><dt className="text-muted">Beginning AR</dt><dd className="mt-1"><Money value={pack.cei_basis.beginning_ar}/></dd></div>
      <div><dt className="text-muted">Credit sales in period</dt><dd className="mt-1"><Money value={pack.cei_basis.credit_sales}/></dd></div>
      <div><dt className="text-muted">Ending AR</dt><dd className="mt-1"><Money value={pack.cei_basis.ending_ar}/></dd></div>
      <div><dt className="text-muted">Ending current AR</dt><dd className="mt-1"><Money value={pack.cei_basis.ending_current_ar}/></dd></div>
    </dl></Panel>
  </div>;
}
