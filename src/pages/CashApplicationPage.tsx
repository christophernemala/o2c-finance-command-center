import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatAED } from '../lib/skills'
import { formatDistanceToNow } from 'date-fns'

export default function CashApplicationPage() {
  const { tenantId } = useAuth()
  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`*, customers(name), invoices(invoice_number)`)
        .eq('tenant_id', tenantId!)
        .order('payment_date', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })

  const unmatched = payments?.filter(p => !p.matched) ?? []
  const matched = payments?.filter(p => p.matched) ?? []

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cash Application</h1>
        <p className="text-sm text-slate-400">{unmatched.length} unmatched &bull; {matched.length} matched</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {[{ title: 'Unmatched Payments', items: unmatched, highlight: true }, { title: 'Matched Payments', items: matched, highlight: false }].map(({ title, items, highlight }) => (
          <div key={title} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-sm font-medium text-slate-900 mb-4">{title}</h2>
            <div className="space-y-2">
              {!items.length && <p className="text-xs text-slate-400">None</p>}
              {items.map(p => (
                <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg ${
                  highlight ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'
                }`}>
                  <div>
                    <p className="text-xs font-medium text-slate-900">{(p as any).customers?.name}</p>
                    <p className="text-xs text-slate-500">
                      {(p as any).invoices?.invoice_number ?? 'No invoice linked'} &bull; {p.method}
                    </p>
                    <p className="text-xs text-slate-400">{formatDistanceToNow(new Date(p.payment_date), { addSuffix: true })}</p>
                  </div>
                  <p className="text-sm font-semibold tabular text-slate-900">{formatAED(p.amount_aed)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
