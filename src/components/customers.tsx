import Link from "next/link";
import Decimal from "decimal.js";
import { FinanceCharts } from "./finance-charts";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@/types/workspace";
import type { Breakdown, BreakdownDimension, Segments } from "@/types/collections";
import { Panel, Empty, Money, Badge } from "./ui";
import { MutationForm } from "./mutation-form";

const dimensionLabel = { category: "Category", region: "Region", customer: "Customer" } as const;
const buckets = [["current", "Current"], ["d1_30", "1–30"], ["d31_60", "31–60"], ["d61_90", "61–90"], ["d90_plus", "90+"]] as const;

/** Outstanding AR by category, region or customer, with drill-down and segment maintenance. */
export function CustomersView({ data, breakdown, segments, query = "" }: { data: Snapshot; breakdown: Breakdown; segments: Segments; query?: string }) {
  const link = (dimension: BreakdownDimension, filter: { category?: string | null; region?: string | null } = {}) => {
    const params = new URLSearchParams({ view: "customers", tenant: data.tenant_id, entity: data.entity_id, dimension });
    if (filter.category) params.set("category", filter.category); if (filter.region) params.set("region", filter.region);
    return `/?${params}`;
  };
  const current = { category: breakdown.category, region: breakdown.region };
  const drill = (label: string) => breakdown.dimension === "category" ? link("customer", { ...current, category: label })
    : breakdown.dimension === "region" ? link("customer", { ...current, region: label }) : null;
  const maker = ["maker", "admin"].includes(data.role);
  const scope = () => <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/><input type="hidden" name="id" value={randomUUID()}/></>;
  const filters = [breakdown.category && `category ${breakdown.category}`, breakdown.region && `region ${breakdown.region}`, query && `search ${query}`].filter(Boolean).join(", ");
  const normalizedQuery = query.trim().toLocaleLowerCase("en");
  const directoryMatches = normalizedQuery ? data.customers.filter(row => `${row.name} ${row.account}`.toLocaleLowerCase("en").includes(normalizedQuery)) : [];
  const visibleRows = normalizedQuery ? breakdown.rows.filter(row => `${row.label} ${row.account ?? ""}`.toLocaleLowerCase("en").includes(normalizedQuery)) : breakdown.rows;
  const Exact = Decimal.clone({ precision: 40 });
  const sum = (key: "open" | "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus" | "disputed") => visibleRows.reduce((total, row) => total.plus(row[key]), new Exact(0)).toFixed(2);
  const visibleTotal = { open: sum("open"), current: sum("current"), d1_30: sum("d1_30"), d31_60: sum("d31_60"), d61_90: sum("d61_90"), d90_plus: sum("d90_plus"), disputed: sum("disputed") };
  // Customer names are not unique (branches), so customer rows carry the account to keep chart labels distinct.
  const chartRows = visibleRows.slice(0, 8).map(row => ({ label: row.account ? `${row.label} (${row.account})` : row.label, value: row.open }));
  if (visibleRows.length > 8) {
    chartRows.push({ label: `Remaining ${visibleRows.length - 8} ${breakdown.dimension === "customer" ? "accounts" : "segments"}`, value: visibleRows.slice(8).reduce((sum, row) => sum.plus(row.open), new Exact(0)).toFixed(2) });
  }
  return <div className="space-y-6">
    {normalizedQuery && <Panel title="Customer directory matches" subtitle="Authenticated customer master records in this legal entity, independent of open AR balances.">
      {directoryMatches.length ? <div className="divide-y divide-line">{directoryMatches.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{row.name}</strong><p className="mt-1 text-xs text-muted">{row.account} · Selected entity</p></div><Link className="button secondary" href={`/?${new URLSearchParams({ view: "collections", tenant: data.tenant_id, entity: data.entity_id, customer: row.id })}`}>Open account</Link></article>)}</div>
        : <Empty title="No customer directory match">Try the customer name or account reference. The workspace directory contains up to 2,000 customer records.</Empty>}
    </Panel>}
    <FinanceCharts key={`${data.tenant_id}/${data.entity_id}/${breakdown.dimension}/${filters}`} title="Segment exposure and invoice aging" scope={filters ? `Filtered to ${filters}` : "Full legal entity"} charts={[
      { key: "segment_exposure", title: `Outstanding by ${dimensionLabel[breakdown.dimension].toLowerCase()}`, unit: "AED", description: "Largest segment balances; remaining segments are combined. Use the table below to drill into source accounts.", series: chartRows },
      { key: "aging", title: "Aging in this selection", unit: "AED", description: "Non-overlapping invoice age bands for the current segment filters.", series: buckets.map(([key, label]) => ({ label: label === "Current" ? "Current" : `${label} days`, value: visibleTotal[key] })) },
    ]}/>

    <Panel title="Outstanding by segment" subtitle={`Open posted invoices as of ${breakdown.as_of}, aged by days past due.${filters ? ` Filtered to ${filters}.` : ""}`}
      action={filters ? <Link className="text-sm text-link underline-offset-2 hover:underline" href={link(breakdown.dimension === "customer" ? "category" : breakdown.dimension)}>Clear filter</Link> : undefined}>
      <nav aria-label="Group by" className="flex flex-wrap gap-2 px-6 pt-4">{(["category", "region", "customer"] as const).map(dimension =>
        <Link key={dimension} href={link(dimension, dimension === "customer" ? current : {})} aria-current={breakdown.dimension === dimension ? "page" : undefined}
          className="rounded-full border border-line px-3 py-1 text-sm aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-surface">By {dimensionLabel[dimension].toLowerCase()}</Link>)}</nav>
      {visibleRows.length ? <div className="mt-4 overflow-auto" role="region" aria-label={`Outstanding balances by ${dimensionLabel[breakdown.dimension]}`} tabIndex={0}><table><caption className="sr-only">Outstanding by {dimensionLabel[breakdown.dimension]}{query ? ` matching ${query}` : ""}</caption>
        <thead><tr><th scope="col">{dimensionLabel[breakdown.dimension]}</th><th scope="col" className="text-right">Open</th>{buckets.map(([key, label]) => <th key={key} scope="col" className="text-right">{label}</th>)}<th scope="col" className="text-right">Share</th></tr></thead>
        <tbody>{visibleRows.map(row => { const href = drill(row.label); const share = normalizedQuery ? (new Decimal(row.open).div(visibleTotal.open || "1").mul(100).toFixed(2)) : row.share_percent; return <tr key={row.customer_id ?? row.label}>
          <td>{href ? <Link className="font-medium text-link underline-offset-2 hover:underline" href={href}>{row.label}</Link>
            : row.customer_id ? <Link className="font-medium text-link underline-offset-2 hover:underline" href={`/?${new URLSearchParams({ view: "collections", tenant: data.tenant_id, entity: data.entity_id, customer: row.customer_id })}`}>{row.label}</Link>
            : <span className="font-medium">{row.label}</span>}
            <p className="mt-1 text-xs text-muted">{row.account ?? `${row.customers} customer${row.customers === 1 ? "" : "s"}`} · {row.invoices} invoice{row.invoices === 1 ? "" : "s"}{row.disputed !== "0.00" ? <> · <Money value={row.disputed}/> disputed</> : null}</p>
            {row.label === "Unassigned" && <Badge value="neutral" label="No segment set"/>}</td>
          <td className="money text-right"><Money value={row.open}/></td>{buckets.map(([key]) => <td key={key} className="money text-right">{row[key] === "0.00" ? <span className="text-muted">—</span> : <Money value={row[key]}/>}</td>)}
          <td className="money text-right">{share === null ? "—" : `${share}%`}</td></tr>; })}</tbody>
        <tfoot><tr><th scope="row">Total</th><td className="money text-right font-semibold"><Money value={visibleTotal.open}/></td>{buckets.map(([key]) => <td key={key} className="money text-right"><Money value={visibleTotal[key]}/></td>)}<td className="money text-right">100%</td></tr></tfoot>
      </table></div> : <Empty title={query ? "No matching customer balances" : "No open invoices"}>{filters ? "Nothing is outstanding for this filter." : "Import invoices to see outstanding balances by category, region and customer."}</Empty>}
    </Panel>

    <Panel title="Customer segments" subtitle={`${segments.customers} customer${segments.customers === 1 ? "" : "s"}; ${segments.unassigned} without a category or region. Segments only group balances; they never change them.`}>
      <div className="grid gap-6 p-6 text-sm lg:grid-cols-2">
        <div><h3 className="font-semibold">In use</h3>
          <p className="mt-2 text-muted">Categories: {segments.categories.length ? segments.categories.join(", ") : "none yet"}</p>
          <p className="mt-1 text-muted">Regions: {segments.regions.length ? segments.regions.join(", ") : "none yet"}</p></div>
        {maker ? <div className="space-y-6">
          <MutationForm action="/api/customers" upload>{scope()}<input type="hidden" name="intent" value="segments_upload"/>
            <label>Upload a CSV<input required type="file" name="file" accept=".csv,text/csv"/></label>
            <p className="text-xs text-muted">Columns <code>account,category,region</code>, up to 2,000 rows. Every account must exist; an empty cell clears the value. The file is applied in full or not at all.</p>
            <button className="button secondary">Apply segments</button></MutationForm>
          <details><summary className="cursor-pointer text-link">Set one customer</summary><MutationForm action="/api/customers">{scope()}<input type="hidden" name="intent" value="segment_set"/>
            <label>Customer<select name="account" required>{data.customers.map(customer => <option key={customer.id} value={customer.account}>{customer.name} ({customer.account})</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><label>Category<input name="category" maxLength={60} list="segment-categories" placeholder="Leave blank to keep"/></label><label>Region<input name="region" maxLength={60} list="segment-regions" placeholder="Leave blank to keep"/></label></div>
            <div className="flex flex-wrap gap-4 text-xs"><label className="inline-flex items-center gap-2"><input type="checkbox" name="clear_category"/>Clear category</label><label className="inline-flex items-center gap-2"><input type="checkbox" name="clear_region"/>Clear region</label></div>
            <p className="text-xs text-muted">A blank field keeps the customer&apos;s current value.</p>
            <datalist id="segment-categories">{segments.categories.map(value => <option key={value} value={value}/>)}</datalist>
            <datalist id="segment-regions">{segments.regions.map(value => <option key={value} value={value}/>)}</datalist>
            <button className="button secondary">Save segment</button></MutationForm></details>
        </div> : <p className="text-muted">Makers and admins set categories and regions.</p>}
      </div>
    </Panel>
  </div>;
}
