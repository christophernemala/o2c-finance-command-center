import Decimal from "decimal.js";
import { Panel, Empty, Money } from "./ui";
import { chartRatio, forecastWeeks, type CashflowRun } from "@/lib/cashflow";
import type { MetricChart } from "@/types/workspace";

export function FinanceCharts({ charts }: { charts: MetricChart[] }) {
  return <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{charts.map(chart => {
    const maximum = chart.series.reduce((max, row) => Decimal.max(max, row.value), new Decimal(0)).toFixed(2);
    return <Panel key={chart.key} title={chart.title} subtitle={chart.unit === "AED" ? "Full-entity current balances · AED" : "Full-entity record counts"}>
      <figure className="space-y-4 p-6"><figcaption className="text-xs leading-5 text-muted">{chart.description}</figcaption>
        {chart.series.map((row, index) => <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span>{row.label}</span><span className="tabular-nums">{chart.unit === "AED" ? <Money value={row.value}/> : row.value}</span></div>
          <svg viewBox="0 0 300 8" className="h-2 w-full" aria-hidden="true" focusable="false"><rect width="300" height="8" rx="4" fill="var(--surface-muted)"/><rect width={300 * chartRatio(row.value, maximum)} height="8" rx="4" fill={index % 2 ? "var(--accent-teal)" : "var(--primary)"}/></svg></div>)}
        {new Decimal(maximum).isZero() && <p className="text-xs text-muted">No positive values in this scope.</p>}
      </figure></Panel>;
  })}</div>;
}
export function CashflowForecast({ run, asOf }: { run: CashflowRun | null; asOf: string }) {
  if (!run) return <Panel title="13-week direct-method cash forecast" subtitle="Forecast values require an approved, preserved source model."><Empty title="No approved 13-week forecast">Connect reconciled opening cash, expected receipt dates, committed disbursements, scenario assumptions, and independent approval evidence.</Empty></Panel>;
  const weeks = forecastWeeks(run);
  const maximum = weeks.reduce((max, week) => Decimal.max(max, new Decimal(week.opening).abs(), new Decimal(week.closing).abs()), new Decimal(0)).toFixed(2);
  return <div className="space-y-6"><Panel title={`13-week forecast · ${run.scenario}`} subtitle={`Model ${run.model_version} · starts ${run.starts_on} · preserved assumptions`}>
    <div className="space-y-4 p-6"><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs text-muted">Opening cash</dt><dd className="mt-2 font-semibold"><Money value={run.opening_cash}/></dd></div><div><dt className="text-xs text-muted">Week 13 closing cash</dt><dd className="mt-2 font-semibold"><Money value={weeks[12].closing}/></dd></div><div><dt className="text-xs text-muted">Confidence</dt><dd className="mt-2 font-semibold">{run.confidence_percent === null ? "Unavailable" : `${run.confidence_percent}%`}</dd></div><div><dt className="text-xs text-muted">Approved</dt><dd className="mt-2">{new Date(run.approved_at).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })} GST</dd></div></dl>
    {asOf !== run.starts_on && <p className="text-xs text-warning">This is the preserved forecast starting {run.starts_on}; it has not been rebased to today’s cash position.</p>}
    <figure><figcaption className="mb-4 text-xs text-muted">Opening-to-closing cash by week. Negative cash is below the zero line. Exact figures are in the table.</figcaption><svg viewBox="0 0 780 180" className="w-full" role="img" aria-label="Thirteen-week cash bridge; exact opening, flows and closing amounts follow in the forecast table">
      <line x1="0" y1="90" x2="780" y2="90" stroke="var(--muted)" strokeWidth="1"/>{weeks.map((week, index) => {
        const openingY = 90 - chartRatio(week.opening, maximum) * 70;
        const closingY = 90 - chartRatio(week.closing, maximum) * 70;
        const x = index * 60 + 10;
        return <g key={week.starts_on}><line x1={x} x2={x + 35} y1={openingY} y2={openingY} stroke="var(--ink)"/><rect x={x} y={Math.min(openingY, closingY)} width="35" height={Math.max(1, Math.abs(openingY - closingY))} fill={new Decimal(week.net).isNegative() ? "var(--primary)" : "var(--accent-teal)"}/><line x1={x} x2={x + 35} y1={closingY} y2={closingY} stroke="var(--ink)"/><text x={x + 17} y="177" textAnchor="middle" fill="var(--muted)" fontSize="10">W{index + 1}</text></g>;
      })}</svg></figure><details className="text-sm"><summary>Source and approval evidence</summary><dl className="mt-3 space-y-2 break-all text-xs"><div>Digest: {run.source_digest}</div><div>Maker: {run.maker} · Independent checker: {run.checker}</div><div>{run.evidence}</div>{run.confidence_method && <div>Confidence methodology: {run.confidence_method}</div>}</dl></details></div>
    <div className="overflow-auto"><table><caption className="sr-only">Thirteen-week direct-method forecast in AED</caption><thead><tr><th scope="col">Week</th><th scope="col" className="money">Opening</th><th scope="col" className="money">Receipts</th><th scope="col" className="money">Payments</th><th scope="col" className="money">Operating net</th><th scope="col" className="money">Investing net</th><th scope="col" className="money">Financing net</th><th scope="col" className="money">Closing</th></tr></thead><tbody>{weeks.map((week, index) => <tr key={week.starts_on}><th scope="row">W{index + 1}<p className="mt-1 whitespace-nowrap text-xs font-normal normal-case tracking-normal">{week.starts_on} – {week.ends_on}</p></th>{[week.opening, week.incoming, week.outgoing, week.operating_net, week.investing_net, week.financing_net, week.closing].map((value, column) => <td key={column} className="money"><Money value={value}/></td>)}</tr>)}</tbody></table></div>
  </Panel><Panel title="Preserved cash assumptions" subtitle={`${run.entries.length} source-linked cash movements; projections do not post to the ledger.`}><div className="overflow-auto"><table><caption className="sr-only">Forecast source movements</caption><thead><tr><th scope="col">Date</th><th scope="col">Source reference</th><th scope="col">Category / direction</th><th scope="col" className="money">AED</th></tr></thead><tbody>{run.entries.map(entry => <tr key={entry.id}><td>{entry.date}</td><td>{entry.source_reference}</td><td>{entry.category} · {entry.direction}</td><td className="money"><Money value={entry.amount}/></td></tr>)}</tbody></table></div></Panel></div>;
}
