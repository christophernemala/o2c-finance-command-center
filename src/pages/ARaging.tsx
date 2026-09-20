import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { agingBucket, eclProvision, riskLabel } from '../lib/skills'
import { Download } from 'lucide-react'

type Invoice = {
  id: string
  invoice_number: string
  amount_aed: number
  outstanding: number
  days_past_due: number
  aging_bucket: string
  ecl_provision: number
  due_date: string
  currency: string
  customers: { name: string; code: string; risk_score: number } | null
}

const BUCKETS = ['All', 'current', '1-30', '31-60', '61-90', '91-120', '120+']

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n)

const pct = (part: number, total: number) =>
  total === 0 ? '0%' : `${Math.round((part / total) * 100)}%`

export default function ARaging() {
  const { tenantId } = useAuth()
  const [activeBucket, setActiveBucket] = useState('All')
  const [search, setSearch] = useState('')

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(name, code, risk_score)')
        .eq('tenant_id', tenantId!)
        .neq('status', 'paid')
        .order('days_past_due', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const totalAR = invoices.reduce((s, i) => s + (i.outstanding ?? 0), 0)
  const totalECL = invoices.reduce((s, i) => s + (i.ecl_provision ?? 0), 0)

  const filtered = invoices.filter(i => {
    const matchBucket = activeBucket === 'All' || i.aging_bucket === activeBucket
    const matchSearch = !search ||
      i.customers?.name.toLowerCase().includes(search.toLowerCase()) ||
      i.invoice_number.toLowerCase().includes(search.toLowerCase())
    return matchBucket && matchSearch
  })

  // Summary by bucket
  const summary = BUCKETS.filter(b => b !== 'All').map(b => ({
    bucket: b,
    count: invoices.filter(i => i.aging_bucket === b).length,
    amount: invoices.filter(i => i.aging_bucket === b).reduce((s, i) => s + (i.outstanding ?? 0), 0),
    ecl: invoices.filter(i => i.aging_bucket === b).reduce((s, i) => s + (i.ecl_provision ?? 0), 0),
  }))

  function exportCSV() {
    const rows = [
      ['Invoice #', 'Customer', 'Outstanding (AED)', 'Due Date', 'DPD', 'Bucket', 'ECL Provision'].join(','),
      ...filtered.map(i => [
        i.invoice_number,
        i.customers?.name ?? '',
        i.outstanding,
        i.due_date,
        i.days_past_due,
        i.aging_bucket,
        i.ecl_provision,
      ].join(','))
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }))
    a.download = `ar-aging-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">AR Aging</h1>
          <p className="text-sm text-slate-500 mt-0.5">IFRS 9 ECL provisions by aging bucket</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-700">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summary.map(s => (
          <button key={s.bucket} onClick={() => setActiveBucket(activeBucket === s.bucket ? 'All' : s.bucket)}
            className={`rounded-xl border p-3 text-left transition ${
              activeBucket === s.bucket
                ? 'border-blue-200 bg-blue-50'
                : 'border-slate-100 bg-white hover:border-slate-200'
            }`}
          >
            <p className="text-xs font-medium text-slate-500">{s.bucket}</p>
            <p className="text-base font-semibold tabular-nums text-slate-900 mt-1">
              {fmt(s.amount)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{pct(s.amount, totalAR)} · ECL {fmt(s.ecl)}</p>
          </button>
        ))}
      </div>

      {/* Totals bar */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-wrap gap-6 shadow-sm">
        <div>
          <p className="text-xs text-slate-500">Total Outstanding AR</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{fmt(totalAR)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total ECL Provision (IFRS 9)</p>
          <p className="text-xl font-semibold tabular-nums text-red-600">{fmt(totalECL)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">ECL Coverage Ratio</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{pct(totalECL, totalAR)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Invoices Shown</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{filtered.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer or invoice…"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <div className="flex gap-1.5 flex-wrap">
          {BUCKETS.map(b => (
            <button key={b} onClick={() => setActiveBucket(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeBucket === b
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Customer', 'Invoice #', 'Due Date', 'Outstanding', 'DPD', 'Bucket', 'ECL Provision', 'Risk'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td></tr>
              ))}
              {!isLoading && filtered.map(inv => {
                const { label: risk } = riskLabel(inv.customers?.risk_score ?? 0)
                const riskCls: Record<string, string> = {
                  Low: 'bg-green-50 text-green-700', Medium: 'bg-amber-50 text-amber-700',
                  High: 'bg-orange-50 text-orange-700', Critical: 'bg-red-50 text-red-700',
                }
                return (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.due_date}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{fmt(inv.outstanding ?? 0)}</td>
                    <td className={`px-4 py-3 tabular-nums font-medium ${
                      inv.days_past_due > 90 ? 'text-red-600' : inv.days_past_due > 30 ? 'text-orange-500' : 'text-slate-600'
                    }`}>{inv.days_past_due}d</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{inv.aging_bucket}</td>
                    <td className="px-4 py-3 tabular-nums text-red-600">{fmt(inv.ecl_provision ?? 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${riskCls[risk] ?? 'bg-slate-50 text-slate-600'}`}>
                        {risk}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No invoices match this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
