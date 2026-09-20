import { useDisputes, useUpdateDisputeStatus } from '../hooks/useDisputes'
import { formatAED } from '../lib/skills'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

export default function DisputesPage() {
  const { data: disputes, isLoading } = useDisputes()
  const { mutate: updateStatus } = useUpdateDisputeStatus()

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Disputes</h1>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-500">
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Invoice</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Reason</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Opened</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {disputes?.map(d => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{(d as any).customers?.name}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{(d as any).invoices?.invoice_number}</td>
                <td className="px-4 py-3 text-right tabular font-medium">{formatAED(d.amount_disputed)}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{d.reason}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    d.status === 'open' ? 'bg-red-50 text-f9-red' :
                    d.status === 'under_review' ? 'bg-amber-50 text-f9-amber' :
                    d.status === 'resolved' ? 'bg-green-50 text-f9-teal' :
                    'bg-red-100 text-f9-red'
                  }`}>{d.status.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3 text-slate-400">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</td>
                <td className="px-4 py-3">
                  {d.status !== 'resolved' && (
                    <button
                      onClick={() => {
                        updateStatus({ id: d.id, status: 'under_review' })
                        toast.success('Moved to Under Review')
                      }}
                      className="text-xs text-f9-blue hover:underline"
                    >Review</button>
                  )}
                </td>
              </tr>
            ))}
            {!disputes?.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No disputes found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
