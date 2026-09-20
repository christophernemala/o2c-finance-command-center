import { motion } from 'framer-motion'
import { useInvoices, useAgingTotals } from '../hooks/useInvoices'
import { useDisputes } from '../hooks/useDisputes'
import { useCustomers } from '../hooks/useCustomers'
import { useAuditTrail } from '../hooks/useAuditTrail'
import StatCard from '../components/StatCard'
import { formatAED } from '../lib/skills'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatDistanceToNow } from 'date-fns'

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current', '1_30': '1-30d', '31_60': '31-60d',
  '61_90': '61-90d', '91_120': '91-120d', over_120: '120d+',
}
const BUCKET_COLORS: Record<string, string> = {
  current: '#0E9F6E', '1_30': '#84cc16', '31_60': '#F59E0B',
  '61_90': '#f97316', '91_120': '#ef4444', over_120: '#991b1b',
}

export default function DashboardPage() {
  const { data: invoices, isLoading: loadingInv } = useInvoices()
  const agingTotalsData = useAgingTotals()
  const { data: disputes } = useDisputes()
  const { data: customers } = useCustomers()
  const { data: audit } = useAuditTrail(5)

  const totalAR = invoices?.reduce((s, i) => s + i.outstanding, 0) ?? 0
  const totalECL = invoices?.reduce((s, i) => s + i.ecl_provision, 0) ?? 0
  const overdueCount = invoices?.filter(i => i.status === 'overdue').length ?? 0
  const openDisputes = disputes?.filter(d => d.status === 'open').length ?? 0

  const agingChartData = agingTotalsData
    ? Object.entries(agingTotalsData).map(([k, v]) => ({
        name: BUCKET_LABELS[k], value: v, key: k,
      }))
    : []

  if (loadingInv) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">O2C Dashboard</h1>
        <p className="text-sm text-slate-400">Real-time AR overview</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total AR" value={formatAED(totalAR)} sub="Outstanding" />
        <StatCard label="ECL Provision" value={formatAED(totalECL)} sub="IFRS 9" trend={-1} />
        <StatCard label="Overdue Invoices" value={String(overdueCount)} sub="Active" trend={overdueCount > 0 ? -1 : 1} />
        <StatCard label="Open Disputes" value={String(openDisputes)} sub="Requires action" trend={openDisputes > 0 ? -1 : 1} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Aging chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-medium text-slate-900 mb-4">AR Aging Breakdown</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agingChartData} barSize={32}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatAED(v).replace('AED', '').trim()} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => formatAED(v)} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {agingChartData.map(entry => (
                  <Cell key={entry.key} fill={BUCKET_COLORS[entry.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Agent activity */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-medium text-slate-900 mb-4">Agent Activity</h2>
          <div className="space-y-3">
            {!audit?.length && <p className="text-xs text-slate-400">No agent actions yet.</p>}
            {audit?.map(a => (
              <div key={a.id} className="flex items-start gap-2.5">
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  a.risk_level === 'high' ? 'bg-f9-red' :
                  a.risk_level === 'medium' ? 'bg-f9-amber' : 'bg-f9-teal'
                }`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-800">{a.agent_name}</p>
                  <p className="text-xs text-slate-500 truncate">{a.action}</p>
                  <p className="text-xs text-slate-300">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top customers at risk */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-medium text-slate-900 mb-4">High Risk Customers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left pb-2 font-medium">Customer</th>
                <th className="text-right pb-2 font-medium">Credit Limit</th>
                <th className="text-right pb-2 font-medium">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {customers?.slice(0, 8).map(c => (
                <tr key={c.id}>
                  <td className="py-2 text-slate-800">{c.name}</td>
                  <td className="py-2 text-right tabular text-slate-600">{formatAED(c.credit_limit)}</td>
                  <td className="py-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.risk_score >= 70 ? 'bg-red-50 text-f9-red' :
                      c.risk_score >= 40 ? 'bg-amber-50 text-f9-amber' :
                      'bg-green-50 text-f9-teal'
                    }`}>{c.risk_score}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
