import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from 'sonner'
import { Phone, Mail, ArrowUpRight } from 'lucide-react'
import { email as sendEmail } from '../lib/apiClient'

type Action = {
  id: string
  action_type: string
  priority_score: number
  status: string
  due_date: string | null
  notes: string | null
  customers: { name: string; contact_email: string } | null
  invoices: { invoice_number: string; outstanding: number } | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n)

export default function Collections() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()

  const { data: actions = [], isLoading } = useQuery<Action[]>({
    queryKey: ['collections', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_actions')
        .select('*, customers(name, contact_email), invoices(invoice_number, outstanding)')
        .eq('tenant_id', tenantId!)
        .eq('status', 'pending')
        .order('priority_score', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('collection_actions')
        .update({ status: 'completed' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', tenantId] })
      toast.success('Action marked complete')
    },
  })

  async function sendReminder(action: Action) {
    if (!action.customers?.contact_email) {
      toast.error('No email address for this customer')
      return
    }
    try {
      await sendEmail(
        action.customers.contact_email,
        `Payment Reminder — ${action.invoices?.invoice_number}`,
        `<p>Dear ${action.customers.name},</p>
         <p>This is a friendly reminder that invoice <strong>${action.invoices?.invoice_number}</strong>
         for <strong>${fmt(action.invoices?.outstanding ?? 0)}</strong> is overdue.</p>
         <p>Please arrange payment at your earliest convenience.</p>
         <p>Regards,<br/>AR Team</p>`
      )
      toast.success('Reminder email sent')
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Collections Queue</h1>
        <p className="text-sm text-slate-500 mt-0.5">Priority-scored collection actions</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Priority', 'Customer', 'Invoice', 'Outstanding', 'Type', 'Due', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td></tr>
              ))}
              {actions.map(a => (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        (a.priority_score ?? 0) >= 80 ? 'bg-red-500' :
                        (a.priority_score ?? 0) >= 50 ? 'bg-orange-400' : 'bg-amber-300'
                      }`} />
                      <span className="tabular-nums text-slate-700 font-medium">{a.priority_score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{a.customers?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.invoices?.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{fmt(a.invoices?.outstanding ?? 0)}</td>
                  <td className="px-4 py-3 capitalize text-slate-600 text-xs">{a.action_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-slate-500">{a.due_date ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => sendReminder(a)}
                        className="p-1.5 rounded border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition" title="Send email reminder">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 transition" title="Log call">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button onClick={() => markDone.mutate(a.id)}
                        className="p-1.5 rounded border border-green-200 hover:bg-green-50 transition" title="Mark complete">
                        <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && actions.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No pending collection actions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
