import { useState } from 'react'
import { useInvoices } from '../hooks/useInvoices'
import { formatAED, ECL_RATES } from '../lib/skills'
import { motion } from 'framer-motion'

const BUCKETS = ['current', '1_30', '31_60', '61_90', '91_120', 'over_120'] as const
const BUCKET_LABELS: Record<string, string> = {
  current: 'Current', '1_30': '1-30 Days', '31_60': '31-60 Days',
  '61_90': '61-90 Days', '91_120': '91-120 Days', over_120: 'Over 120 Days',
}

export default function AgingPage() {
  const { data: invoices, isLoading } = useInvoices()
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? invoices : invoices?.filter(i => i.aging_bucket === filter)

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">AR Aging</h1>

      {/* Bucket filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            filter === 'all' ? 'bg-f9-blue text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >All</button>
        {BUCKETS.map(b => (
          <button
            key={b}
            onClick={() => setFilter(b)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filter === b ? 'bg-f9-blue text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >{BUCKET_LABELS[b]}</button>
        ))}
      </div>

      {/* Aging table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-slate-500">
                <th className="text-left px-4 py-3 font-medium">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-right px-4 py-3 font-medium">Outstanding</th>
                <th className="text-right px-4 py-3 font-medium">DPD</th>
                <th className="text-left px-4 py-3 font-medium">Bucket</th>
                <th className="text-right px-4 py-3 font-medium">ECL ({(ECL_RATES['current'] * 100).toFixed(1)}%+)</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered?.map(inv => (
                <motion.tr
                  key={inv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-slate-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-slate-800">{(inv as any).customers?.name}</td>
                  <td className="px-4 py-3 text-right tabular text-slate-900 font-medium">{formatAED(inv.outstanding)}</td>
                  <td className="px-4 py-3 text-right tabular">
                    <span className={inv.days_past_due > 90 ? 'text-f9-red font-medium' : inv.days_past_due > 30 ? 'text-f9-amber' : 'text-slate-600'}>
                      {inv.days_past_due}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{BUCKET_LABELS[inv.aging_bucket]}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular text-slate-500">{formatAED(inv.ecl_provision)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      inv.status === 'overdue' ? 'bg-red-50 text-f9-red' :
                      inv.status === 'paid' ? 'bg-green-50 text-f9-teal' :
                      inv.status === 'disputed' ? 'bg-amber-50 text-f9-amber' :
                      'bg-slate-100 text-slate-600'
                    }`}>{inv.status}</span>
                  </td>
                </motion.tr>
              ))}
              {!filtered?.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No invoices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
