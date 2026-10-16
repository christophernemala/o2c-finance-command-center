"use client";
import { useId, useState } from "react";
import Decimal from "decimal.js";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, PieChart, Table2, X } from "lucide-react";
import type { MetricChart } from "@/types/workspace";
import { chartRatio } from "@/lib/cashflow";
import { formatAed } from "@/lib/money";
import { Panel } from "./ui";
const Exact = Decimal.clone({ precision: 40 });
const names: Record<string, string> = { normal: "Standard collection", follow_up: "Follow-up due", promise_to_pay: "Promise to pay", none: "No dispute", open: "Dispute open", resolved: "Dispute resolved", pending: "Awaiting approval", approved: "Approved, not posted", rejected: "Rejected", posted: "Posted to ledger", credit: "Incoming credits", debit: "Outgoing debits" };
const label = (key: string, value: string) => ["collections", "disputes", "approvals", "bank_direction"].includes(key) ? names[value] ?? value : value;
const color = (index: number) => `var(--chart-${index % 5 + 1})`;
const modes = [{ id: "bar", name: "Bar chart", Icon: BarChart3 }, { id: "donut", name: "Donut chart", Icon: PieChart }, { id: "table", name: "Exact figures", Icon: Table2 }] as const;
export function ChartExplorer({ charts, title = "Aging, settlement and cash analysis" }: { charts: MetricChart[]; title?: string }) {
  if (!charts.length) return null;
  return <section aria-label="Interactive financial analysis" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Financial analysis</p><h2 className="mt-1 text-xl font-semibold">{title}</h2></div><span className="data-scope">Full legal entity · select a segment to inspect</span></div>
    <div className="chart-grid">{charts.map(chart => <ChartTile key={chart.key} chart={chart}/>)}</div>
  </section>;
}
function ChartTile({ chart }: { chart: MetricChart }) {
  const [mode, setMode] = useState<typeof modes[number]["id"]>(chart.key === "aging" || chart.key === "bank_direction" ? "bar" : "donut");
  const [selected, setSelected] = useState<string | null>(null); const reduced = useReducedMotion(); const id = useId();
  const maximum = chart.series.reduce((max, row) => Exact.max(max, row.value), new Exact(0)).toFixed(2);
  const total = chart.series.reduce((sum, row) => sum.plus(row.value), new Exact(0)).toFixed(2);
  const active = chart.series.find(row => row.label === selected);
  const amount = (value: string) => chart.unit === "AED" ? formatAed(value) : `${value} records`;
  let offset = 0;
  return <Panel className="chart-tile" title={chart.title} subtitle={chart.unit === "AED" ? "Current balances · AED" : "Recorded invoice / proposal counts"} action={<span className="data-scope">{chart.unit}</span>}>
    <div className="p-5"><div className="chart-switch" role="group" aria-label={`${chart.title} visualization`}>{modes.map(({ id: key, name, Icon }) => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)} title={name}><Icon size={14}/><span>{name}</span></button>)}</div>
      <p className="mt-4 min-h-10 text-xs leading-5 text-muted">{chart.description}</p>
      {mode === "table" ? <div className="mt-4 overflow-auto"><table><caption className="sr-only">Exact figures for {chart.title}</caption><thead><tr><th scope="col">Recorded state</th><th scope="col" className="text-right">{chart.unit}</th></tr></thead><tbody>{chart.series.map(row => <tr key={row.label}><th scope="row" className="!bg-surface !font-normal !normal-case !tracking-normal">{label(chart.key, row.label)}</th><td className="money text-right">{amount(row.value)}</td></tr>)}</tbody></table></div>
      : <div className={mode === "donut" ? "mt-5 grid items-center gap-4 sm:grid-cols-[140px_minmax(0,1fr)]" : "mt-5"}>
        {mode === "donut" && <div className="relative mx-auto h-36 w-36"><svg viewBox="0 0 160 160" aria-hidden="true" className="h-full w-full -rotate-90"><circle cx="80" cy="80" r="61" fill="none" stroke="var(--surface-muted)" strokeWidth="20"/>{chart.series.map((row, index) => {
          const ratio = chartRatio(row.value, total); const start = offset; offset += ratio;
          return ratio > 0 && <motion.circle key={row.label} cx="80" cy="80" r="61" pathLength="1" fill="none" stroke={color(index)} strokeWidth={selected === row.label ? 25 : 20} strokeDasharray={`${ratio} ${1 - ratio}`} strokeDashoffset={-start} opacity={selected && selected !== row.label ? .25 : 1} onClick={() => setSelected(selected === row.label ? null : row.label)} className="cursor-pointer" initial={false} animate={{ strokeWidth: selected === row.label ? 25 : 20, opacity: selected && selected !== row.label ? .25 : 1 }} transition={{ duration: reduced ? 0 : .2 }}/>;
        })}</svg><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-muted">{active ? "Selected" : "Composition"}</span><span className="mt-1 text-xl font-semibold">{new Exact(total).isZero() ? "—" : active ? `${new Exact(active.value).div(total).mul(100).toFixed(1)}%` : "100%"}</span></div></div>}
        <div className="min-w-0 space-y-2">{chart.series.map((row, index) => <motion.button key={row.label} className="chart-series" aria-pressed={selected === row.label} aria-describedby={`${id}-selection`} onClick={() => setSelected(selected === row.label ? null : row.label)} whileTap={reduced ? undefined : { scale: .99 }}>
          <span className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-medium"><span className="h-2 w-2 rounded-full" style={{ background: color(index) }}/>{label(chart.key, row.label)}</span><span className="text-xs tabular-nums">{amount(row.value)}</span></span>
          {mode === "bar" && <span className="mt-2 block h-3 overflow-hidden rounded bg-surface-muted"><motion.span className="block h-full rounded" style={{ width: `${chartRatio(row.value, maximum) * 100}%`, background: color(index), opacity: selected && selected !== row.label ? .3 : 1 }} initial={false}/></span>}
        </motion.button>)}</div>
      </div>}
      <div id={`${id}-selection`} aria-live="polite" className="mt-4 flex min-h-12 items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs"><span>{active ? <><strong>{label(chart.key, active.label)}</strong><span className="ml-2 tabular-nums">{amount(active.value)}</span></> : new Exact(total).isZero() ? "No recorded values in this scope." : "Select a segment to focus its exact value."}</span>{active && <button className="inline-flex min-h-8 min-w-8 items-center justify-center" onClick={() => setSelected(null)} aria-label={`Clear ${chart.title} selection`}><X size={14}/></button>}</div>
    </div>
  </Panel>;
}
