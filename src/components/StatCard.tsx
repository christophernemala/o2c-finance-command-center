import { motion } from 'framer-motion'
import { cn } from '../lib/utils'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: number // positive = good (green), negative = bad (red)
  className?: string
}

export default function StatCard({ label, value, sub, trend, className }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'bg-white rounded-xl border border-slate-100 shadow-sm p-5',
        className
      )}
    >
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold tabular text-slate-900">{value}</p>
      {(sub || trend !== undefined) && (
        <p className={cn(
          'text-xs mt-1',
          trend !== undefined
            ? trend >= 0 ? 'text-f9-teal' : 'text-f9-red'
            : 'text-slate-400'
        )}>
          {trend !== undefined && (trend >= 0 ? '↑' : '↓')}
          {sub}
        </p>
      )}
    </motion.div>
  )
}
