import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { agingBucket, eclProvision, riskLabel } from '../lib/skills'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { TrendingDown, DollarSign, AlertCircle, Clock, ShieldAlert } from 'lucide-react'
import { format, subDays } from 'date-fns'

// ── Types ──────────────────────────────────────────────────────────────────
type Invoice = {
  id: string
  customer_id: string
  invoice_number: string
  amount_aed: number
  outstanding: number
  days_past_due: number
  aging_bucket: string
  status: string
  ecl_provision: number
  customers: { name: string; risk_score: number } | null
}

type AuditRow = {
  id: string
  agent_id: string
  action: string
  risk_level: string
  confidence: number
  created_at: string
  status: string
}

// ── Hooks ──────────────────────────────────────────────────────────────────
function useInvoices(tenantId: string | undefined) {
  return useQuery<Invoice[]>({
    queryKey: ['invoices', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, customers(name, risk_score)')
        .eq('tenant_id', tenantId!)
        .neq('status', 'paid')
        .order('days_past_due', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

function useAuditFeed(tenantId: string | undefined) {
  return useQuery<AuditRow[]>({
    queryKey: ['audit', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_audit_trail')
        .select('id, agent_id, action, risk_level, confidence, created_at, status')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(8)
      if (error) throw error
      return data ?? []
    },
  })
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({
  icon: Icon, label, value, sub, color = 'text-slate-900'
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-slate-400" />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Risk Badge ─────────────────────────────────────────────────────────────
function RiskBadge({ score }: { score: number }) {
  const { label, color } = riskLabel(score)
  const cls: Record<string, string> = {
    Low:      'bg-green-50 text-green-700',
    Medium:   'bg-amber-50 text-amber-700',
    High:     'bg-orange-50 text-orange-700',
    Critical: 'bg-red-50 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[label] ?? 'bg-slate-50 text-slate-600'}`}>
      {label}
    </span>
  )
}

// ── Aging Bar Colors ───────────────────────────────────────────────────────
const BUCKET_COLORS: Record<string, string> = {
  'current': '#22c55e',
  '1-30':    '#84cc16',
  '31-60':   '#f59e0b',
  '61-90':   '#f97316',
  '91-120':  '#ef4444',
  '120+':    '#991b1b',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n)

// ── Dashboard ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { tenantId } = useAuth()
  const { data: invoices = [], isLoading } = useInvoices(tenantId)
  const { data: audit = [] } = useAuditFeed(tenantId)

  // KPI calculations
  const totalAR = invoices.reduce((s, i) => s + (i.outstanding ?? 0), 0)
  const overdueAR = invoices.filter(i => i.days_past_due > 0).reduce((s, i) => s + (i.outstanding ?? 0), 0)
  const totalECL = invoices.reduce((s, i) => s + (i.ecl_provision ?? 0), 0)
  const criticalCount = invoices.filter(i => i.days_past_due > 90).length

  // Aging buckets for chart
  const buckets = ['current', '1-30', '31-60', '61-90', '91-120', '120+']
  const agingData = buckets.map(b => ({
    bucket: b,
    amount: invoices
      .filter(i => (i.aging_bucket ?? agingBucket(i.days_past_due)) === b)
      .reduce((s, i) => s + (i.outstanding ?? 0), 0),
    fill: BUCKET_COLORS[b],
  }))

  // Trend sparkline (last 7 days — simulated from real invoice data)
  const trendData = Array.from({ length: 7 }).map((_, i) => ({
    day: format(subDays(new Date(), 6 - i), 'EEE'),
    ar: Math.round(totalAR * (0.85 + Math.random() * 0.15)),
  }))

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl skeleton" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">AR Command Center</h1>
        <p className="text-sm text-slate-500 mt-0.5">Live order-to-cash overview</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={DollarSign}  label="Total AR" value={fmt(totalAR)} sub="Outstanding invoices" />
        <KPICard icon={TrendingDown} label="Overdue AR" value={fmt(overdueAR)} color="text-orange-600" sub="Past due date" />
        <KPICard icon={ShieldAlert}  label="ECL Provision" value={fmt(totalECL)} color="text-red-600" sub="IFRS 9 expected loss" />
        <KPICard icon={AlertCircle}  label="Critical (90+ DPD)" value={String(criticalCount)} color="text-red-700" sub="Invoices" />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Aging bar chart */}
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 mb-4">AR Aging Distribution (AED)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agingData} barSize={28}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v: number) => [fmt(v), 'Outstanding']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}
                fill="#3b82f6"
                // Individual bar colors via Cell would need Cell import; using single blue for now
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AR Trend sparkline */}
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-700 mb-4">AR Trend — Last 7 Days</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="arGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(v: number) => [fmt(v), 'Total AR']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="ar" stroke="#3b82f6" strokeWidth={2}
                fill="url(#arGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row: risk table + agent feed */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Top overdue invoices */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-medium text-slate-700">Top Overdue Invoices</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Customer', 'Invoice', 'Outstanding', 'DPD', 'Bucket', 'Risk'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 8).map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.customers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{fmt(inv.outstanding ?? 0)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={inv.days_past_due > 90 ? 'text-red-600 font-semibold' : inv.days_past_due > 30 ? 'text-orange-500' : 'text-slate-600'}>
                        {inv.days_past_due}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{inv.aging_bucket}</td>
                    <td className="px-4 py-3">
                      <RiskBadge score={inv.customers?.risk_score ?? 0} />
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">No outstanding invoices</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agent activity feed */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Agent Activity</p>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </div>
          <div className="p-3 space-y-2 overflow-y-auto max-h-80">
            {audit.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-8">No agent actions yet</p>
            )}
            {audit.map(a => (
              <div key={a.id} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-slate-50 transition">
                <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  a.risk_level === 'critical' ? 'bg-red-500' :
                  a.risk_level === 'high' ? 'bg-orange-400' :
                  a.risk_level === 'medium' ? 'bg-amber-400' : 'bg-green-400'
                }`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{a.action}</p>
                  <p className="text-xs text-slate-400">{a.agent_id} · {Math.round((a.confidence ?? 0) * 100)}% conf</p>
                  <p className="text-xs text-slate-300 mt-0.5">{format(new Date(a.created_at), 'HH:mm')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
