import { Panel, Empty, Money } from "./ui";
import { forecastWeeks, type CashflowRun } from "@/lib/cashflow";
import { CashflowTimeline } from "./cashflow-timeline";
export { ChartExplorer as FinanceCharts } from "./chart-explorer";

type ForecastWeek = ReturnType<typeof forecastWeeks>[number];
const weekAmounts = (week: ForecastWeek) => [
  ["Opening", week.opening],
  ["Receipts", week.incoming],
  ["Payments", week.outgoing],
  ["Operating net", week.operating_net],
  ["Investing net", week.investing_net],
  ["Financing net", week.financing_net],
  ["Closing", week.closing],
] as const;

export function CashflowForecast({ run, asOf }: { run: CashflowRun | null; asOf: string }) {
  if (!run) return <Panel title="13-week direct-method cash forecast" subtitle="Forecast values require an approved, preserved source model."><Empty title="No approved 13-week forecast">Connect reconciled opening cash, expected receipt dates, committed disbursements, scenario assumptions, and independent approval evidence.</Empty></Panel>;
  const weeks = forecastWeeks(run);
  return <div className="space-y-6"><Panel title={`13-week forecast · ${run.scenario}`} subtitle={`Model ${run.model_version} · starts ${run.starts_on} · preserved assumptions`}>
    <div className="space-y-4 p-6"><dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs text-muted">Opening cash</dt><dd className="mt-2 font-semibold"><Money value={run.opening_cash}/></dd></div><div><dt className="text-xs text-muted">Week 13 closing cash</dt><dd className="mt-2 font-semibold"><Money value={weeks[12].closing}/></dd></div><div><dt className="text-xs text-muted">Confidence</dt><dd className="mt-2 font-semibold">{run.confidence_percent === null ? "Unavailable" : `${run.confidence_percent}%`}</dd></div><div><dt className="text-xs text-muted">Approved</dt><dd className="mt-2">{new Date(run.approved_at).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })} GST</dd></div></dl>
    {asOf !== run.starts_on && <p className="text-xs text-warning">This is the preserved forecast starting {run.starts_on}; it has not been rebased to today’s cash position.</p>}
    <CashflowTimeline key={run.id} weeks={weeks}/><details className="text-sm"><summary>Source and approval evidence</summary><dl className="mt-3 space-y-2 break-all text-xs"><div>Digest: {run.source_digest}</div><div>Maker: {run.maker} · Independent checker: {run.checker}</div><div>{run.evidence}</div>{run.confidence_method && <div>Confidence methodology: {run.confidence_method}</div>}</dl></details></div>
    <div className="desktop-record-table overflow-auto" role="region" aria-label="Thirteen-week forecast amounts" tabIndex={0}><table><caption className="sr-only">Thirteen-week direct-method forecast in AED</caption><thead><tr><th scope="col">Week</th>{weekAmounts(weeks[0]).map(([label]) => <th key={label} scope="col" className="money">{label}</th>)}</tr></thead><tbody>{weeks.map((week, index) => <tr key={week.starts_on}><th scope="row">W{index + 1}<p className="mt-1 whitespace-nowrap text-xs font-normal normal-case tracking-normal">{week.starts_on} – {week.ends_on}</p></th>{weekAmounts(week).map(([label, value]) => <td key={label} className="money"><Money value={value}/></td>)}</tr>)}</tbody></table></div>
    <ul className="record-cards" aria-label="Thirteen-week forecast amounts">{weeks.map((week, index) => <li className="record-card" key={week.starts_on}><div className="record-card-header"><div><strong>Week {index + 1}</strong><p>{week.starts_on} – {week.ends_on}</p></div><span className="data-scope">AED</span></div><dl>{weekAmounts(week).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Money value={value}/></dd></div>)}</dl></li>)}</ul>
  </Panel><Panel title="Preserved cash assumptions" subtitle={`${run.entries.length} source-linked cash movements; projections do not post to the ledger.`}>
    <div className="desktop-record-table overflow-auto" role="region" aria-label="Preserved cash source movements" tabIndex={0}><table><caption className="sr-only">Forecast source movements</caption><thead><tr><th scope="col">Date</th><th scope="col">Source reference</th><th scope="col">Category / direction</th><th scope="col" className="money">AED</th></tr></thead><tbody>{run.entries.map(entry => <tr key={entry.id}><td>{entry.date}</td><td>{entry.source_reference}</td><td>{entry.category} · {entry.direction}</td><td className="money"><Money value={entry.amount}/></td></tr>)}</tbody></table></div>
    <ul className="record-cards" aria-label="Preserved cash source movements">{run.entries.map(entry => <li className="record-card" key={entry.id}><div className="record-card-header"><div><strong>{entry.source_reference}</strong><p>{entry.date} · {entry.category} · {entry.direction}</p></div><span className="data-scope">AED</span></div><dl><div><dt>Amount</dt><dd><Money value={entry.amount}/></dd></div></dl></li>)}</ul>
  </Panel></div>;
}
