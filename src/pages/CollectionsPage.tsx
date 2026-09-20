import { useInvoices } from '../hooks/useInvoices'
import { formatAED, collectionPriority } from '../lib/skills'

export default function CollectionsPage() {
  const { data: invoices, isLoading } = useInvoices({ status: 'overdue' })

  const sorted = invoices
    ? [...invoices].sort((a, b) =>
        collectionPriority({
          outstanding: b.outstanding, days_past_due: b.days_past_due,
          risk_score: (b as any).customers?.risk_score ?? 0,
        }) -
        collectionPriority({
          outstanding: a.outstanding, days_past_due: a.days_past_due,
          risk_score: (a as any).customers?.risk_score ?? 0,
        })
      )
    : []

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Collections Queue</h1>
        <p className="text-sm text-slate-400">Prioritized by outstanding amount, DPD, and risk score</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-3 font-medium">#</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Contact</th>
              <th className="text-right px-4 py-3 font-medium">Outstanding</th>
              <th className="text-right px-4 py-3 font-medium">DPD</th>
              <th className="text-right px-4 py-3 font-medium">Risk</th>
              <th className="text-right px-4 py-3 font-medium">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((inv, i) => (
              <tr key={inv.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-400 font-mono">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{(inv as any).customers?.name}</td>
                <td className="px-4 py-3 text-f9-blue">
                  {(inv as any).customers?.contact_email
                    ? <a href={`mailto:${(inv as any).customers.contact_email}`} className="hover:underline">{(inv as any).customers.contact_email}</a>
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular font-semibold text-f9-red">{formatAED(inv.outstanding)}</td>
                <td className="px-4 py-3 text-right tabular text-f9-amber font-medium">{inv.days_past_due}d</td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    ((inv as any).customers?.risk_score ?? 0) >= 70 ? 'bg-red-50 text-f9-red' :
                    ((inv as any).customers?.risk_score ?? 0) >= 40 ? 'bg-amber-50 text-f9-amber' :
                    'bg-green-50 text-f9-teal'
                  }`}>{(inv as any).customers?.risk_score ?? 0}</span>
                </td>
                <td className="px-4 py-3 text-right tabular text-slate-600">
                  {collectionPriority({
                    outstanding: inv.outstanding,
                    days_past_due: inv.days_past_due,
                    risk_score: (inv as any).customers?.risk_score ?? 0,
                  }).toFixed(0)}
                </td>
              </tr>
            ))}
            {!sorted.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No overdue invoices — queue clear ✓</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
