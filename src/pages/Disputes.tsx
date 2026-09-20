import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from 'sonner'

type Dispute = {
  id: string
  reason: string
  amount: number
  status: string
  priority: string
  opened_at: string
  invoices: { invoice_number: string } | null
  customers: { name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  open:          'bg-red-50 text-red-700',
  under_review:  'bg-amber-50 text-amber-700',
  resolved:      'bg-green-50 text-green-700',
  rejected:      'bg-slate-100 text-slate-500',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-slate-100 text-slate-600',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n)

export default function Disputes() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [filter, setFilter] = useState('open')

  const { data: disputes = [], isLoading } = useQuery<Dispute[]>({
    queryKey: ['disputes', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disputes')
        .select('*, invoices(invoice_number), customers(name)')
        .eq('tenant_id', tenantId!)
        .order('opened_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('disputes')
        .update({ status, ...(status === 'resolved' ? { resolved_at: new Date().toISOString() } : {}) })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disputes', tenantId] })
      toast.success('Dispute status updated')
    },
  })

  const shown = disputes.filter(d => filter === 'all' || d.status === filter)

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Disputes</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage invoice disputes and deductions</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {['open', 'under_review', 'resolved', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {s.replace('_', ' ')} ({s === 'all' ? disputes.length : disputes.filter(d => d.status === s).length})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Customer', 'Invoice', 'Reason', 'Amount', 'Priority', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(3)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td></tr>
              ))}
              {shown.map(d => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.customers?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.invoices?.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{d.reason}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{fmt(d.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[d.priority]}`}>
                      {d.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[d.status]}`}>
                      {d.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {d.status === 'open' && (
                        <button onClick={() => updateStatus.mutate({ id: d.id, status: 'under_review' })}
                          className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 transition">
                          Review
                        </button>
                      )}
                      {d.status === 'under_review' && (
                        <>
                          <button onClick={() => updateStatus.mutate({ id: d.id, status: 'resolved' })}
                            className="text-xs px-2 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50 transition">
                            Resolve
                          </button>
                          <button onClick={() => updateStatus.mutate({ id: d.id, status: 'rejected' })}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 transition">
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && shown.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No disputes in this status</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
