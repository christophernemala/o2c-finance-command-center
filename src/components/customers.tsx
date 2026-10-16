import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { Snapshot } from "@/types/workspace";
import type { Breakdown, BreakdownDimension, Segments } from "@/types/collections";
import { Panel, Empty, Money, Badge } from "./ui";
import { MutationForm } from "./mutation-form";

const dimensionLabel = { category: "Category", region: "Region", customer: "Customer" } as const;
const buckets = [["current", "Current"], ["d1_30", "1–30"], ["d31_60", "31–60"], ["d61_90", "61–90"], ["d90_plus", "90+"]] as const;

/** Outstanding AR by category, region or customer, with drill-down and segment maintenance. */
export function CustomersView({ data, breakdown, segments }: { data: Snapshot; breakdown: Breakdown; segments: Segments }) {
  const link = (dimension: BreakdownDimension, filter: { category?: string | null; region?: string | null } = {}) => {
    const params = new URLSearchParams({ view: "customers", tenant: data.tenant_id, entity: data.entity_id, dimension });
    if (filter.category) params.set("category", filter.category); if (filter.region) params.set("region", filter.region);
    return `/?${params}`;
  };
  const current = { category: breakdown.category, region: breakdown.region };
  const drill = (label: string) => breakdown.dimension === "category" ? link("customer", { ...current, category: label })
    : breakdown.dimension === "region" ? link("customer", { ...current, region: label }) : null;
  const maker = ["maker", "admin"].includes(data.role);
  const Scope = () => <><input type="hidden" name="tenant" value={data.tenant_id}/><input type="hidden" name="entity" value={data.entity_id}/><input type="hidden" name="id" value={randomUUID()}/></>;
  const filters = [breakdown.category && `category ${breakdown.category}`, breakdown.region && `region ${breakdown.region}`].filter(Boolean).join(", ");
  return <div className="space-y-6">
    <Panel title="Outstanding by segment" subtitle={`Open posted invoices as of ${breakdown.as_of}, aged by days past due.${filters ? ` Filtered to ${filters}.` : ""}`}
      action={filters ? <Link className="text-sm text-link underline-offset-2 hover:underline" href={link(breakdown.dimension === "customer" ? "category" : breakdown.dimension)}>Clear filter</Link> : undefined}>
      <nav aria-label="Group by" className="flex flex-wrap gap-2 px-6 pt-4">{(["category", "region", "customer"] as const).map(dimension =>
        <Link key={dimension} href={link(dimension, dimension === "customer" ? current : {})} aria-current={breakdown.dimension === dimension ? "page" : undefined}
          className="rounded-full border border-line px-3 py-1 text-sm aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-surface">By {dimensionLabel[dimension].toLowerCase()}</Link>)}</nav>
      {breakdown.rows.length ? <div className="mt-4 overflow-auto"><table><caption className="sr-only">Outstanding by {breakdown.dimension}</caption>
        <thead><tr><th scope="col">{dimensionLabel[breakdown.dimension]}</th><th scope="col" className="text-right">Open</th>{buckets.map(([key, label]) => <th key={key} scope="col" className="text-right">{label}</th>)}<th scope="col" className="text-right">Share</th></tr></thead>
        <tbody>{breakdown.rows.map(row => { const href = drill(row.label); return <tr key={row.customer_id ?? row.label}>
          <td>{href ? <Link className="font-medium text-link underline-offset-2 hover:underline" href={href}>{row.label}</Link>
            : row.customer_id ? <Link className="font-medium text-link underline-offset-2 hover:underline" href={`/?${new URLSearchParams({ view: "collections", tenant: data.tenant_id, entity: data.entity_id, customer: row.customer_id })}`}>{row.label}</Link>
            : <span className="font-medium">{row.label}</span>}
            <p className="mt-1 text-xs text-muted">{row.account ?? `${row.customers} customer${row.customers === 1 ? "" : "s"}`} · {row.invoices} invoice{row.invoices === 1 ? "" : "s"}{row.disputed !== "0.00" ? <> · <Money value={row.disputed}/> disputed</> : null}</p>
            {row.label === "Unassigned" && <Badge value="neutral" label="No segment set"/>}</td>
          <td className="money text-right"><Money value={row.open}/></td>{buckets.map(([key]) => <td key={key} className="money text-right">{row[key] === "0.00" ? <span className="text-muted">—</span> : <Money value={row[key]}/>}</td>)}
          <td className="money text-right">{row.share_percent === null ? "—" : `${row.share_percent}%`}</td></tr>; })}</tbody>
        <tfoot><tr><th scope="row">Total</th><td className="money text-right font-semibold"><Money value={breakdown.total.open}/></td>{buckets.map(([key]) => <td key={key} className="money text-right"><Money value={breakdown.total[key]}/></td>)}<td className="money text-right">100%</td></tr></tfoot>
      </table></div> : <Empty title="No open invoices">{filters ? "Nothing is outstanding for this filter." : "Import invoices to see outstanding balances by category, region and customer."}</Empty>}
    </Panel>

    <Panel title="Customer segments" subtitle={`${segments.customers} customer${segments.customers === 1 ? "" : "s"}; ${segments.unassigned} without a category or region. Segments only group balances; they never change them.`}>
      <div className="grid gap-6 p-6 text-sm lg:grid-cols-2">
        <div><h3 className="font-semibold">In use</h3>
          <p className="mt-2 text-muted">Categories: {segments.categories.length ? segments.categories.join(", ") : "none yet"}</p>
          <p className="mt-1 text-muted">Regions: {segments.regions.length ? segments.regions.join(", ") : "none yet"}</p></div>
        {maker ? <div className="space-y-6">
          <MutationForm action="/api/customers" upload><Scope/><input type="hidden" name="intent" value="segments_upload"/>
            <label>Upload a CSV<input required type="file" name="file" accept=".csv,text/csv"/></label>
            <p className="text-xs text-muted">Columns <code>account,category,region</code>, up to 2,000 rows. Every account must exist; an empty cell clears the value. The file is applied in full or not at all.</p>
            <button className="button secondary">Apply segments</button></MutationForm>
          <details><summary className="cursor-pointer text-link">Set one customer</summary><MutationForm action="/api/customers"><Scope/><input type="hidden" name="intent" value="segment_set"/>
            <label>Customer<select name="account" required>{data.customers.map(customer => <option key={customer.id} value={customer.account}>{customer.name} ({customer.account})</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2"><label>Category<input name="category" maxLength={60} list="segment-categories" placeholder="Distributor"/></label><label>Region<input name="region" maxLength={60} list="segment-regions" placeholder="Dubai"/></label></div>
            <datalist id="segment-categories">{segments.categories.map(value => <option key={value} value={value}/>)}</datalist>
            <datalist id="segment-regions">{segments.regions.map(value => <option key={value} value={value}/>)}</datalist>
            <button className="button secondary">Save segment</button></MutationForm></details>
        </div> : <p className="text-muted">Makers and admins set categories and regions.</p>}
      </div>
    </Panel>
  </div>;
}
