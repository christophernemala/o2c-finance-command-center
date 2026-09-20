import { useAuditTrail } from '../hooks/useAuditTrail'
import { formatDistanceToNow } from 'date-fns'

export default function AuditPage() {
  const { data: trail, isLoading } = useAuditTrail(200)

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Agent Audit Trail</h1>
        <p className="text-sm text-slate-400">Every agent action, immutable log</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-3 font-medium">Agent</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Entity</th>
              <th className="text-right px-4 py-3 font-medium">Confidence</th>
              <th className="text-left px-4 py-3 font-medium">Risk</th>
              <th className="text-left px-4 py-3 font-medium">Approval</th>
              <th className="text-left px-4 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {trail?.map(a => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{a.agent_name}</td>
                <td className="px-4 py-3 text-slate-600">{a.action}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{a.entity_type}/{a.entity_id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-right tabular">{a.confidence_score}%</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.risk_level === 'high' ? 'bg-red-50 text-f9-red' :
                    a.risk_level === 'medium' ? 'bg-amber-50 text-f9-amber' :
                    'bg-green-50 text-f9-teal'
                  }`}>{a.risk_level}</span>
                </td>
                <td className="px-4 py-3">
                  {a.requires_approval
                    ? <span className={`text-xs ${ a.approved_by ? 'text-f9-teal' : 'text-f9-amber' }`}>
                        {a.approved_by ? 'Approved' : 'Pending'}
                      </span>
                    : <span className="text-slate-300">Auto</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</td>
              </tr>
            ))}
            {!trail?.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No agent actions yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
