import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts'
import { addDays, format, startOfToday } from 'date-fns'

type Invoice = {
  outstanding: number
  due_date: string
  days_past_due: number
  risk_score?: number
  customers: { risk_score: number } | null
}

/**
 * Liquidity forecasting:
 * - Group expected cash inflows by expected collection date
 * - Expected date = due_date + probability-weighted delay based on DPD bucket
 * - Provides a 30-day cash inflow forecast
 */
function buildForecast(invoices: Invoice[]) {
  const today = startOfToday()
  // Probability-weighted collection delay by DPD
  const collectionDelay = (dpd: number, riskScore: number) => {
    if (dpd === 0) return 5   // current: avg 5 days after due
    if (dpd <= 30) return 10
    if (dpd <= 60) return 20
    if (dpd <= 90) return 35
    if (dpd <= 120) return 50
    return 70 + Math.floor(riskScore / 10) // 120+ DPD: risk-adjusted
  }

  // Build day-by-day map for next 30 days
  const map: Record<string, number> = {}
  for (let d = 0; d < 30; d++) {
    map[format(addDays(today, d), 'yyyy-MM-dd')] = 0
  }

  for (const inv of invoices) {
    const delay = collectionDelay(inv.days_past_due, inv.customers?.risk_score ?? 50)
    const expectedDate = addDays(new Date(inv.due_date), delay)
    const key = format(expectedDate, 'yyyy-MM-dd')
    if (key in map) {
      map[key] += inv.outstanding ?? 0
    }
  }

  // Build running cumulative
  let cumulative = 0
  return Object.entries(map).map(([date, daily]) => {
    cumulative += daily
    return {
      date: format(new Date(date), 'dd MMM'),
      daily,
      cumulative,
    }
  })
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n)

export default function Liquidity() {
  const { tenantId } = useAuth()

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices-liquidity', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('outstanding, due_date, days_past_due, customers(risk_score)')
        .eq('tenant_id', tenantId!)
        .neq('status', 'paid')
        .neq('status', 'written_off')
      if (error) throw error
      return data ?? []
    },
  })

  const forecast = buildForecast(invoices)
  const total30 = forecast.reduce((s, d) => s + d.daily, 0)
  const peak = Math.max(...forecast.map(d => d.daily))
  const peakDay = forecast.find(d => d.daily === peak)
  const cumulative30 = forecast[forecast.length - 1]?.cumulative ?? 0

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 skeleton rounded" />
        <div className="h-64 skeleton rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Liquidity Forecast</h1>
        <p className="text-sm text-slate-500 mt-0.5">30-day expected cash inflows — probability-weighted by aging bucket &amp; risk score</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Expected Inflows (30d)</p>
          <p className="text-xl font-semibold tabular-nums text-green-600 mt-1">{fmt(total30)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Peak Collection Day</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900 mt-1">{peakDay?.date ?? '—'}</p>
          <p className="text-xs text-slate-400">{fmt(peak)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Cumulative at Day 30</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900 mt-1">{fmt(cumulative30)}</p>
        </div>
      </div>

      {/* Daily inflow chart */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-700 mb-4">Daily Expected Inflows (AED)</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={forecast}>
            <defs>
              <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              interval={4} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              tickFormatter={v => `${Math.round(v / 1000)}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v), 'Expected']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Area type="monotone" dataKey="daily" stroke="#22c55e" strokeWidth={2}
              fill="url(#liquidGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative chart */}
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-700 mb-4">Cumulative 30-Day Cash Inflow (AED)</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={forecast}>
            <defs>
              <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              interval={4} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
              tickFormatter={v => `${Math.round(v / 1000)}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v), 'Cumulative']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2}
              fill="url(#cumGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-slate-400">
        Forecast uses probability-weighted collection delays: current invoices expected +5 days,
        1–30 DPD +10d, 31–60 DPD +20d, 61–90 DPD +35d, 91–120 DPD +50d, 120+ DPD risk-adjusted.
        Not a guarantee of cash receipt.
      </p>
    </div>
  )
}
