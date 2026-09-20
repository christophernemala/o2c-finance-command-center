import { useInvoices } from '../hooks/useInvoices'
import { formatAED } from '../lib/skills'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { addDays, format } from 'date-fns'

export default function LiquidityPage() {
  const { data: invoices } = useInvoices()

  // Build 30-day forward cash forecast from due dates
  const forecastMap: Record<string, number> = {}
  invoices?.filter(i => ['issued', 'overdue', 'partial'].includes(i.status)).forEach(inv => {
    const key = inv.due_date
    forecastMap[key] = (forecastMap[key] || 0) + inv.outstanding
  })

  const today = new Date()
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = format(addDays(today, i), 'yyyy-MM-dd')
    return { date: format(addDays(today, i), 'MMM d'), expected: forecastMap[d] || 0 }
  })

  let cumulative = 0
  const withCumulative = chartData.map(row => {
    cumulative += row.expected
    return { ...row, cumulative }
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Liquidity & Cash Forecast</h1>
        <p className="text-sm text-slate-400">30-day rolling cash inflow forecast from open AR</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-medium text-slate-900 mb-4">Expected Cash Inflows</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={withCumulative}>
            <defs>
              <linearGradient id="cumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1A56DB" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#1A56DB" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => formatAED(v)} />
            <Area type="monotone" dataKey="cumulative" stroke="#1A56DB" fill="url(#cumulativeGrad)" strokeWidth={2} name="Cumulative" />
            <Area type="monotone" dataKey="expected" stroke="#0E9F6E" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Daily" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
