"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownWideNarrow, ArrowUpRight, Search, SlidersHorizontal, X } from "lucide-react";
import { riskBands, filterWorklist, type RiskBand, type WorklistSort } from "@/lib/collections/explorer";
import { addAmounts } from "@/lib/money";
import { chartRatio } from "@/lib/cashflow";
import type { WorklistRow } from "@/types/collections";
import { Panel, Empty, Money, Badge } from "./ui";
export function CollectionsExplorer({ rows, tenant, entity, selectedCustomer, sidebar }: { rows: WorklistRow[]; tenant: string; entity: string; selectedCustomer?: string; sidebar: ReactNode }) {
  const [query, setQuery] = useState(""); const [band, setBand] = useState<RiskBand>("all"); const [sort, setSort] = useState<WorklistSort>("overdue");
  const reduced = useReducedMotion();
  const buckets = useMemo(() => riskBands(rows), [rows]);
  const filtered = useMemo(() => filterWorklist(rows, query, band, sort), [rows, query, band, sort]);
  const total = addAmounts(rows.map(row => row.overdue));
  const href = (customer: string) => `/?${new URLSearchParams({ view: "collections", tenant, entity, customer })}#customer-workspace`;
  return <div className="collections-grid">
    <aside aria-label="Account aging filters" className="space-y-4"><div className="flex items-center gap-2 px-1"><SlidersHorizontal size={16} className="text-link"/><h2 className="font-semibold">Account aging</h2></div>
      <p className="px-1 text-xs leading-5 text-muted">Grouped by oldest overdue invoice. Amounts are each account’s total overdue balance.</p>
      <div className="risk-buckets"><button className="risk-card" aria-pressed={band === "all"} onClick={() => setBand("all")}><span className="text-xs text-muted">All overdue accounts</span><strong className="block overflow-x-auto text-lg"><Money value={total}/></strong><span className="text-xs text-muted">{rows.length} accounts</span></button>
        {buckets.map((item, index) => <motion.button key={item.id} className="risk-card" aria-pressed={band === item.id} onClick={() => setBand(item.id)} whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: .985 }}>
          <span className="flex items-center justify-between gap-2 text-xs"><span>{item.label}</span><span className="text-muted">{item.count} accounts</span></span>
          <strong className="mt-2 block overflow-x-auto text-base"><Money value={item.amount}/></strong>
          <span className="mt-3 block h-1 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full rounded-full" style={{ width: `${chartRatio(item.amount, total) * 100}%`, background: `var(--chart-${Math.min(index, 4) + 1})` }}/></span>
        </motion.button>)}
      </div>
    </aside>
    <div className="min-w-0"><Panel title="Outstanding accounts" subtitle="Search an account, select an aging band, then open its collection workspace." action={<span className="data-scope">{filtered.length} of {rows.length} accounts</span>}>
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-5"><label className="relative min-w-40 flex-1 text-xs"><span className="flex items-center gap-2"><Search size={14}/>Find a customer or account</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Customer name or account reference"/></label>
        <label className="text-xs"><span className="flex items-center gap-2"><ArrowDownWideNarrow size={14}/>Order accounts by</span><select value={sort} onChange={event => setSort(event.target.value as WorklistSort)}><option value="overdue">Largest overdue balance</option><option value="age">Oldest unpaid invoice</option><option value="customer">Customer name A–Z</option></select></label>
        {(query || band !== "all") && <button className="button secondary" onClick={() => { setQuery(""); setBand("all"); }}><X size={14}/>Clear account filters</button>}
      </div>
      <div className="flex flex-wrap justify-between gap-2 px-5 py-3 text-xs text-muted" aria-live="polite"><span>{band === "all" ? "All aging bands" : buckets.find(item => item.id === band)?.label} · {filtered.length} matching accounts</span><span>Selected overdue <Money value={addAmounts(filtered.map(row => row.overdue))}/></span></div>
      {filtered.length ? <div className="overflow-auto"><table><caption className="sr-only">Collections worklist</caption><thead><tr><th scope="col">Customer / account</th><th scope="col" className="text-right">Overdue AED</th><th scope="col" className="text-right">Oldest invoice</th><th scope="col">Collection status</th></tr></thead><tbody>{filtered.map(row => <tr key={row.customer_id} aria-selected={selectedCustomer === row.customer_id}>
        <td><Link href={href(row.customer_id)} className="inline-flex items-center gap-2 font-semibold text-link">{row.customer}<ArrowUpRight size={13}/></Link><p className="mt-1 text-xs text-muted">{row.account}</p><div className="mt-2 flex flex-wrap gap-1">{row.on_hold && <Badge value="failed" label="Credit hold"/>}{row.broken_promises > 0 && <Badge value="review" label={`${row.broken_promises} broken promises`}/>}</div></td>
        <td className="money text-right"><Money value={row.overdue}/><p className="mt-1 font-sans text-xs text-muted">{row.overdue_invoices} overdue invoices</p></td><td className="text-right tabular-nums">{row.oldest_days} days</td>
        <td><Badge value={row.last_message === "pending" ? "pending" : row.oldest_days > 90 ? "review" : "info"} label={row.last_message === "pending" ? "Message awaiting approval" : row.disputed_invoices > 0 ? "Dispute to resolve" : row.contacts === 0 ? "Contact needed" : row.oldest_days > 90 ? "Escalation review" : "Payment reminder"}/><Link href={href(row.customer_id)} className="mt-3 block text-xs font-semibold text-link">Open collection account →</Link></td>
      </tr>)}</tbody></table></div> : <Empty title={rows.length ? "No accounts match these filters" : "No overdue customers"}>{rows.length ? "Clear the aging selection or search another customer." : "Import invoices to build the worklist. Accounts appear after an open invoice passes its due date."}</Empty>}
    </Panel></div>
    <aside aria-label="Collection priorities" className="priority-rail">{sidebar}</aside>
  </div>;
}
