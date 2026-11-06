"use client";
import { useState } from "react";
import Decimal from "decimal.js";
import { motion, useReducedMotion } from "framer-motion";
import { chartRatio, type ForecastWeek } from "@/lib/cashflow";
import { Money } from "./ui";
export function CashflowTimeline({ weeks }: { weeks: ForecastWeek[] }) {
  const [selected, setSelected] = useState(0); const reduced = useReducedMotion(); const active = weeks[selected];
  const maximum = weeks.reduce((max, week) => Decimal.max(max, new Decimal(week.opening).abs(), new Decimal(week.closing).abs()), new Decimal(0)).toFixed(2);
  if (!active) return null;
  return <section aria-label="Interactive approved cash forecast" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">Select a week to inspect its preserved cash movements.</p><span className="data-scope">Approved source model · no inferred receipts</span></div>
    <svg viewBox="0 0 780 190" className="w-full" role="img" aria-label="Opening-to-closing weekly cash bridge; select a week using the buttons below">
      <line x1="0" y1="90" x2="780" y2="90" stroke="var(--muted)" strokeWidth="1"/>{weeks.map((week, index) => {
        const opening = 90 - chartRatio(week.opening, maximum) * 70, closing = 90 - chartRatio(week.closing, maximum) * 70, x = index * 60 + 10;
        return <g key={week.starts_on} onClick={() => setSelected(index)} className="cursor-pointer"><title>Week {index + 1}: {week.starts_on} to {week.ends_on}</title><rect x={x-4} y="8" width="48" height="170" rx="8" fill={selected === index ? "var(--primary-soft)" : "transparent"}/><line x1={x} x2={x + 35} y1={opening} y2={opening} stroke="var(--ink)"/><motion.rect x={x} y={Math.min(opening, closing)} width="35" height={Math.max(2, Math.abs(opening - closing))} rx="3" fill={new Decimal(week.net).isNegative() ? "var(--chart-4)" : "var(--chart-1)"} initial={false} animate={{ opacity: selected === index ? 1 : .5 }} transition={{ duration: reduced ? 0 : .16 }}/><line x1={x} x2={x + 35} y1={closing} y2={closing} stroke="var(--ink)"/><text x={x + 17} y="188" textAnchor="middle" fill="var(--muted)" fontSize="10">W{index + 1}</text></g>;
      })}
    </svg>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Forecast week selection">{weeks.map((week, index) => <button key={week.starts_on} onClick={() => setSelected(index)} aria-pressed={selected === index} aria-label={`Inspect week ${index + 1}, starting ${week.starts_on}`} className="min-h-11 min-w-11 rounded-xl border border-line px-3 text-xs aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-link">W{index+1}</button>)}</div>
    <div aria-live="polite" className="rounded-2xl border border-line bg-surface-muted p-4"><h3 className="font-semibold">Week {selected + 1} · {active.starts_on} – {active.ends_on}</h3><dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Opening cash", active.opening], ["Expected receipts", active.incoming], ["Planned payments", active.outgoing], ["Closing cash", active.closing]].map(([name, value]) => <div key={name}><dt className="text-xs text-muted">{name}</dt><dd className="mt-2 text-sm"><Money value={value}/></dd></div>)}</dl></div>
  </section>;
}
