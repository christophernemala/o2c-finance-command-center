import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatAed } from "@/lib/money";
export function Panel({ title, subtitle, children, className, action }: { title: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={cn("workspace-panel", className)}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5"><div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>{action}</header>{children}
  </section>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="px-6 py-12 text-center"><div className="mx-auto mb-4 h-1 w-10 rounded bg-primary"/><h3 className="font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{children}</p></div>;
}
export function Badge({ value, label }: { value: string; label?: string }) {
  const good = ["posted", "approved", "committed", "settled", "credit", "resolved"].includes(value);
  const danger = ["failed", "rejected", "debit", "outcome_unknown", "void"].includes(value);
  const waiting = ["pending", "review", "open", "partial", "awaiting_approval"].includes(value);
  const info = value === "info";
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", good ? "bg-success-soft text-success" : danger ? "bg-danger-soft text-danger" : waiting ? "bg-warning-soft text-warning" : info ? "bg-info-soft text-info" : "bg-surface-muted text-muted")}>{label ?? value.replaceAll("_", " ")}</span>;
}
export function Money({ value }: { value: string | null }) { return <span className="whitespace-nowrap tabular-nums">{value === null ? "Unavailable" : formatAed(value)}</span>; }
/** KPI amount: the currency code is set small so large figures fit a card at display size. */
export function KpiAmount({ value }: { value: string }) {
  const [code, ...rest] = formatAed(value).split(/\s+/);
  return <><span className="mr-1 font-sans text-sm font-medium tracking-normal text-muted">{code}</span><span className="whitespace-nowrap">{rest.join(" ")}</span></>;
}
