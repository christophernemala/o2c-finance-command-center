import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatAed } from "@/lib/money";
export function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-surface shadow-xs backdrop-blur-xl", className)}>
    <div className="border-b border-line px-6 py-5"><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>{children}
  </section>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="px-6 py-12 text-center"><div className="mx-auto mb-4 h-1 w-10 rounded bg-primary"/><h3 className="font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{children}</p></div>;
}
export function Badge({ value }: { value: string }) {
  const good = ["posted", "approved", "committed", "settled", "credit", "resolved"].includes(value);
  const danger = ["failed", "rejected", "debit", "outcome_unknown", "void"].includes(value);
  const waiting = ["pending", "review", "open", "partial", "awaiting_approval"].includes(value);
  return <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-medium", good ? "bg-success-soft text-success" : danger ? "bg-danger-soft text-danger" : waiting ? "bg-warning-soft text-warning" : "bg-surface-muted text-muted")}>{value.replaceAll("_", " ")}</span>;
}
export function Money({ value }: { value: string | null }) { return <span className="whitespace-nowrap tabular-nums">{value === null ? "Unavailable" : formatAed(value)}</span>; }
