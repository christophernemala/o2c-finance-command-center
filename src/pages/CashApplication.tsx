import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from 'sonner'
import { Link2, AlertCircle } from 'lucide-react'

type Payment = {
  id: string
  amount: number
  currency: string
  payment_date: string
  reference: string | null
  method: string | null
  status: string
  matched_by: string | null
  invoice_id: string | null
  customers: { name: string } | null
  invoices: { invoice_number: string } | null
}

type Invoice = {
  id: string
  invoice_number: string
  outstanding: number
  customers: { name: string } | null
}

const fmt = (n: number, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const STATUS: Record<string, string> = {
  matched:   'bg-green-50 text-green-700',
  unmatched: 'bg-amber-50 text-amber-700',
  partial:   'bg-blue-50 text-blue-700',
}

export default function CashApplication() {
  const { tenantId } = useAuth()
  const qc = useQueryClient()
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)

  const { data: payments = [], isLoading: loadingPayments } = useQuery<Payment[]>({
    queryKey: ['payments', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, customers(name), invoices(invoice_number)')
        .eq('tenant_id', tenantId!)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const { data: openInvoices = [] } = useQuery<Invoice[]>({
    queryKey: ['open-invoices', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, outstanding, customers(name)')
        .eq('tenant_id', tenantId!)
        .in('status', ['issued', 'overdue'])
        .order('due_date')
      if (error) throw error
      return data ?? []
    },
  })

  const matchPayment = useMutation({
    mutationFn: async () => {
      if (!selectedPayment || !selectedInvoice) throw new Error('Select a payment and invoice')
      const { error } = await supabase
        .from('payments')
        .update({ invoice_id: selectedInvoice, status: 'matched', matched_by: 'manual' })
        .eq('id', selectedPayment)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', tenantId] })
      qc.invalidateQueries({ queryKey: ['open-invoices', tenantId] })
      setSelectedPayment(null)
      setSelectedInvoice(null)
      toast.success('Payment matched to invoice')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const unmatched = payments.filter(p => p.status === 'unmatched')
  const matched = payments.filter(p => p.status === 'matched')
  const totalUnmatched = unmatched.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cash Application</h1>
        <p className="text-sm text-slate-500 mt-0.5">Match incoming payments to open invoices</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Unmatched Payments</p>
          <p className="text-xl font-semibold tabular-nums text-amber-600 mt-1">{unmatched.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Unmatched Value</p>
          <p className="text-xl font-semibold tabular-nums text-amber-600 mt-1">{fmt(totalUnmatched)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Matched Today</p>
          <p className="text-xl font-semibold tabular-nums text-green-600 mt-1">{matched.length}</p>
        </div>
      </div>

      {/* Manual matching panel */}
      {unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-amber-800">{unmatched.length} payments need manual matching</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">1. Select unmatched payment</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {unmatched.map(p => (
                  <button key={p.id} onClick={() => setSelectedPayment(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                      selectedPayment === p.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}>
                    <span className="font-medium">{p.customers?.name ?? 'Unknown'}</span>
                    <span className="ml-2 tabular-nums text-slate-600">{fmt(p.amount, p.currency)}</span>
                    <span className="ml-2 text-xs text-slate-400">{p.payment_date}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">2. Select open invoice</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {openInvoices.map(inv => (
                  <button key={inv.id} onClick={() => setSelectedInvoice(inv.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                      selectedInvoice === inv.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}>
                    <span className="font-mono text-xs text-slate-500">{inv.invoice_number}</span>
                    <span className="ml-2 font-medium">{inv.customers?.name}</span>
                    <span className="ml-2 tabular-nums text-slate-600">{fmt(inv.outstanding)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => matchPayment.mutate()}
            disabled={!selectedPayment || !selectedInvoice || matchPayment.isPending}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Link2 className="w-4 h-4" />
            {matchPayment.isPending ? 'Matching…' : 'Apply Match'}
          </button>
        </div>
      )}

      {/* All payments table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-medium text-slate-700">All Payments</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Customer', 'Amount', 'Date', 'Reference', 'Method', 'Matched Invoice', 'Status', 'By'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingPayments && [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td></tr>
              ))}
              {payments.map(p => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{p.customers?.name ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{fmt(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-slate-500">{p.payment_date}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.reference ?? '—'}</td>
                  <td className="px-4 py-3 capitalize text-slate-500 text-xs">{p.method ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.invoices?.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS[p.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 capitalize">{p.matched_by ?? '—'}</td>
                </tr>
              ))}
              {!loadingPayments && payments.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No payments recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
