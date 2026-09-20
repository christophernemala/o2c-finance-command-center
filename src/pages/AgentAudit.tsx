import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { format } from 'date-fns'
import { ShieldCheck } from 'lucide-react'

type AuditRow = {
  id: string
  agent_id: string
  action: string
  entity_type: string | null
  risk_level: string
  confidence: number
  requires_human: boolean
  status: string
  created_at: string
  payload: Record<string, unknown> | null
  profiles: { full_name: string } | null
}

const RISK: Record<string, string> = {
  low:      'bg-green-50 text-green-700',
  medium:   'bg-amber-50 text-amber-700',
  high:     'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
}

const STATUS: Record<string, string> = {
  executed:         'bg-slate-100 text-slate-600',
  pending_approval: 'bg-blue-50 text-blue-700',
  rejected:         'bg-red-50 text-red-600',
}

export default function AgentAudit() {
  const { tenantId } = useAuth()

  const { data: rows = [], isLoading } = useQuery<AuditRow[]>({
    queryKey: ['audit', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_audit_trail')
        .select('*, profiles(full_name)')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data ?? []
    },
  })

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-screen-xl">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-slate-400" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Agent Audit Trail</h1>
          <p className="text-sm text-slate-500 mt-0.5">Immutable log of all agentic actions — append-only</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Time', 'Agent', 'Action', 'Entity', 'Risk', 'Confidence', 'Human Gate', 'Status', 'Approved By'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 skeleton rounded" /></td></tr>
              ))}
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {format(new Date(r.created_at), 'dd MMM HH:mm:ss')}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.agent_id}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{r.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 capitalize">{r.entity_type ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${RISK[r.risk_level] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.risk_level}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">
                    {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {r.requires_human
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">Required</span>
                      : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.profiles?.full_name ?? '—'}</td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No agent actions recorded yet. Run the seed script to populate.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
