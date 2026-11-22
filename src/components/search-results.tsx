import { Panel, Empty, Money, Badge } from "./ui";
import type { InvoiceSearchMatch } from "@/lib/search";
export function InvoiceSearchResults({ query, rows, unavailable = false }: { query: string; rows: InvoiceSearchMatch[]; unavailable?: boolean }) {
  return <Panel title="Invoice search results" subtitle={`Entity-wide invoice search for “${query}” · up to 50 matches`}>
    {unavailable ? <Empty title="Invoice search unavailable">The search service did not return verified results. Refresh later; no ledger data has been inferred.</Empty>
      : rows.length ? <div>
        <ul className="record-cards" aria-label="Invoice search results">{rows.map(row => <li className="record-card" key={row.id}>
          <div className="record-card-header"><div><strong>{row.number}</strong><p>{row.customer} · {row.account}</p></div><Badge value={row.dispute === "open" ? "disputed" : row.collection}/></div>
          <dl><div><dt>Open AED</dt><dd className="money"><Money value={row.open}/></dd></div><div><dt>Due date</dt><dd>{row.due_date}</dd></div><div><dt>Days overdue</dt><dd>{row.days_overdue}</dd></div></dl>
        </li>)}</ul>
        <div className="desktop-record-table overflow-auto" role="region" aria-label="Invoice search results" tabIndex={0}><table><caption className="sr-only">Entity-wide invoice search results</caption><thead><tr><th scope="col">Invoice / customer</th><th scope="col">Account</th><th scope="col" className="money">Open AED</th><th scope="col">Due date</th><th scope="col">Days overdue</th><th scope="col">Dispute / collection</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
          <td><strong>{row.number}</strong><p className="mt-1 text-xs text-muted">{row.customer}</p></td><td>{row.account}</td><td className="money"><Money value={row.open}/></td><td>{row.due_date}</td><td>{row.days_overdue}</td><td><Badge value={row.dispute === "open" ? "disputed" : row.collection}/></td>
        </tr>)}</tbody></table></div>
      </div> : <Empty title="No matching invoices">Try a customer name, account reference, or invoice number. Search only returns records available to your selected legal entity.</Empty>}
  </Panel>;
}
