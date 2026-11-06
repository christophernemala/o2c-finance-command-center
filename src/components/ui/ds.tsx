import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import Decimal from "decimal.js";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatCalendarDate, formatEntityTime } from "@/lib/time";

/* Design-system primitives. Server components unless noted; tokens live in globals.css. */

type Tone = "primary" | "secondary" | "danger";
export function Button({ tone = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button {...props} className={cn("button", tone === "secondary" && "secondary", tone === "danger" && "danger", className)}/>;
}

/** Labelled input. The error is announced and tied to the field with aria-describedby. */
export function Input({ label, hint, error, id, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; id: string }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div className={cn("ds-field", className)}><label htmlFor={id}>{label}</label>
    <input id={id} {...props} aria-invalid={error ? true : undefined} aria-describedby={describedBy}/>
    {hint && <p id={`${id}-hint`} className="ds-hint">{hint}</p>}{error && <p id={`${id}-error`} className="ds-error" role="alert">{error}</p>}</div>;
}
export function Select({ label, id, options, className, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; options: { value: string; label: string }[] }) {
  return <div className={cn("ds-field", className)}><label htmlFor={id}>{label}</label>
    <select id={id} {...props}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

export function Card({ title, subtitle, action, children, className }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("workspace-panel", className)}>
    {title && <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-5"><div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>{action}</header>}
    {children}</section>;
}

/** Currency-aware amount: the code is always shown and the currency's own decimals are used. */
export function MoneyText({ value, currency, locale }: { value: string | null; currency: string; locale?: string }) {
  return <span className="whitespace-nowrap tabular-nums">{value === null ? "Unavailable" : formatMoney(value, currency, locale)}</span>;
}
/** A timestamp in the entity's own zone, or a calendar date that never shifts. */
export function DateTime({ value, timeZone, locale }: { value: string; timeZone?: string; locale?: string }) {
  const calendar = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return <time dateTime={value}>{calendar ? formatCalendarDate(value, locale) : formatEntityTime(value, timeZone ?? "UTC", locale)}</time>;
}

/** A KPI with explicit states, so "no data yet" and "failed" never look like a number or like each other. */
export type StatState = { kind: "value"; value: ReactNode; asOf?: string } | { kind: "insufficient"; reason: string } | { kind: "error"; retryHref?: string };
export function StatTile({ label, state, footnote }: { label: string; state: StatState; footnote?: ReactNode }) {
  return <div className="ds-stat"><p className="ds-stat-label">{label}</p>
    {state.kind === "value" ? <><p className="ds-stat-value">{state.value}</p>{state.asOf && <p className="ds-hint">As of <DateTime value={state.asOf}/></p>}</>
      : state.kind === "insufficient" ? <><p className="ds-stat-value text-muted">—</p><p className="ds-hint">Not enough data: {state.reason}</p></>
      : <><p className="ds-stat-value text-muted">—</p><p className="ds-hint text-danger">Couldn&apos;t load.{state.retryHref && <> <a className="text-link underline" href={state.retryHref}>Retry</a></>}</p></>}
    {footnote && <p className="ds-hint">{footnote}</p>}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="px-6 py-12 text-center"><div className="mx-auto mb-4 h-1 w-10 rounded bg-primary"/><h3 className="font-semibold">{title}</h3>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{children}</p>{action && <div className="mt-6">{action}</div>}</div>;
}
export type ErrorKind = "forbidden" | "unavailable" | "invalid";
const errorCopy: Record<ErrorKind, [string, string]> = {
  forbidden: ["You don't have access to this", "Your role doesn't include this view for the selected entity. Ask an administrator if you need it."],
  unavailable: ["This couldn't load", "The service didn't answer. Nothing was changed. Try again in a moment."],
  invalid: ["This request isn't valid", "A filter or link is out of range. Clear the filters and try again."],
};
export function ErrorState({ kind, retryHref }: { kind: ErrorKind; retryHref?: string }) {
  const [title, body] = errorCopy[kind];
  return <div role="alert" className="px-6 py-12 text-center"><h3 className="font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{body}</p>
    {retryHref && <a className="button secondary mt-6" href={retryHref}>Try again</a>}</div>;
}
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return <div aria-hidden="true" className={cn("space-y-3", className)}>{Array.from({ length: lines }, (_, i) => <div key={i} className="ds-skeleton" style={{ width: `${92 - i * 14}%` }}/>)}</div>;
}

/* DataTable: sorted and filtered on the server through the URL, so it needs no client state and links keep their view. */
export interface Column<Row> {
  key: string; header: string; cell: (row: Row) => ReactNode;
  /** Value used to sort and filter: a decimal string for amounts (compared exactly) or plain text. */
  sortValue?: (row: Row) => string | null; numeric?: boolean; align?: "end"; primary?: boolean;
}
export function sortRows<Row>(rows: Row[], columns: Column<Row>[], sort?: string, query?: string): Row[] {
  const term = query?.trim().toLowerCase();
  const filtered = term ? rows.filter(row => columns.some(column => (column.sortValue?.(row) ?? "").toLowerCase().includes(term))) : rows;
  const [key, direction] = (sort ?? "").split(":");
  const column = columns.find(entry => entry.key === key && entry.sortValue);
  if (!column) return filtered;
  const sign = direction === "desc" ? -1 : 1;
  const compare = (a: string | null, b: string | null) => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1; // Missing values last in either direction.
    return sign * (column.numeric ? new Decimal(a).comparedTo(new Decimal(b)) : a.localeCompare(b));
  };
  return [...filtered].sort((a, b) => compare(column.sortValue!(a), column.sortValue!(b)));
}
export function DataTable<Row>({ caption, rows, columns, rowKey, sort, query, hrefFor, empty }: {
  caption: string; rows: Row[]; columns: Column<Row>[]; rowKey: (row: Row) => string; sort?: string; query?: string;
  /** Builds the same URL with a new sort or filter, so the view keeps its other parameters. */
  hrefFor: (change: { sort?: string; q?: string }) => string; empty?: ReactNode;
}) {
  const shown = sortRows(rows, columns, sort, query);
  const [sortKey, direction] = (sort ?? "").split(":");
  const primary = columns.find(column => column.primary) ?? columns[0];
  return <div className="ds-table">
    <form method="get" action={hrefFor({}).split("?")[0]} className="ds-table-filter" role="search">
      {[...new URLSearchParams(hrefFor({}).split("?")[1] ?? "")].filter(([name]) => name !== "q").map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
      <label htmlFor={`${caption}-filter`} className="sr-only">Filter {caption}</label>
      <input id={`${caption}-filter`} name="q" defaultValue={query} placeholder="Filter" type="search"/>
    </form>
    {shown.length === 0 ? (empty ?? <EmptyState title="Nothing to show">{query ? "No rows match this filter." : "There are no rows yet."}</EmptyState>) : <>
      <table className="ds-table-wide"><caption className="sr-only">{caption}</caption><thead><tr>{columns.map(column => {
        const active = sortKey === column.key; const next = active && direction !== "desc" ? "desc" : "asc";
        return <th key={column.key} scope="col" className={cn(column.align === "end" && "text-right")} aria-sort={active ? (direction === "desc" ? "descending" : "ascending") : undefined}>
          {column.sortValue ? <a href={hrefFor({ sort: `${column.key}:${next}` })}>{column.header}{active ? (direction === "desc" ? " ↓" : " ↑") : ""}</a> : column.header}</th>;
      })}</tr></thead>
        <tbody>{shown.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.key} className={cn(column.align === "end" && "text-right tabular-nums")}>{column.cell(row)}</td>)}</tr>)}</tbody></table>
      <ul className="ds-table-cards" aria-label={caption}>{shown.map(row => <li key={rowKey(row)}>
        <p className="ds-card-primary">{primary.cell(row)}</p>
        <dl>{columns.filter(column => column !== primary).map(column => <div key={column.key}><dt>{column.header}</dt><dd>{column.cell(row)}</dd></div>)}</dl></li>)}</ul>
    </>}</div>;
}
