import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatAed } from "@/lib/money";
export { Card as Panel } from "./ds";
export { EmptyState as Empty } from "./ds";
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
export { Button, Input, Select, Card, MoneyText, DateTime, StatTile, EmptyState, ErrorState, Skeleton, DataTable, sortRows, type Column, type StatState, type ErrorKind } from "./ds";
export { Sheet, Toast } from "./overlay";
export { Switch, Spinner } from "./controls";
